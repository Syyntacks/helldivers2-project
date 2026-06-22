document.addEventListener('DOMContentLoaded', main)

let cachedPlanets = null;
let dispatchData = null;

/*
    ============================================
    LIVE REFRESH SYSTEM
    Polls the Helldivers API every 60 seconds for
    fresh player counts, health, and war stats.
    Updates visible DOM elements in-place without
    re-rendering the whole page.
    ============================================
*/

let liveApiConfig = null;  // loaded from /static-api/api_config.json on first tick
let moLookups = null;      // loaded from /static-api/mo_lookups.json on first MO fetch
let liveState = {
    previous: null, // snapshot from 60 seconds ago { planets:[], war:{}, timestamp: ms }
    current: null, // most recent snapshot
    totalPlayers: 0, // galaxy-wide player count from latest war fetch
    rates: {}, // ratePerSecond by planet index (for smooth interpolation)
    lastTickCounts: {}, // playerCount at last live tick, by planet index
    lastTickTime: null, // Date.now() of the last successful tick
};

async function loadApiConfig() {
    if (liveApiConfig) return liveApiConfig;
    try {
        const res = await fetch('/static-api/api_config.json');
        if (res.ok) liveApiConfig = await res.json();
    } catch (e) {
        console.warn('[Live Refresh] Could not load api_config.json:', e);
    }
    return liveApiConfig;
}

async function fetchLiveSnapshot() {
    const config = await loadApiConfig();
    if (!config?.planetsUrl || !config?.warUrl) return null;

    const headers = config.headers || {};

    const [planetsRes, warRes] = await Promise.all([
        fetch(config.planetsUrl, { headers }),
        fetch(config.warUrl, { headers }),
    ]);

    if (!planetsRes.ok || !warRes.ok) {
        console.warn('[Live Refresh] API status — planets:', planetsRes.status, '| war:', warRes.status);
        throw new Error('Live API request failed');
    }

    return {
        planets: await planetsRes.json(),
        war: await warRes.json(),
        timestamp: Date.now(),
    };
}

function applyLiveSnapshot(snapshot) {
    if (!snapshot?.planets || !Array.isArray(snapshot.planets)) return;

    //update galaxy-wide total player count for percentage recalculation
    if (snapshot.war?.statistics?.playerCount !== undefined) {
        liveState.totalPlayers = snapshot.war.statistics.playerCount;
    }

    snapshot.planets.forEach(raw => {
        const idx = raw.index;

        //keep cachedPlanets in sync so the modal always shows fresh numbers when opened
        if (cachedPlanets?.[idx]) {
            if (raw.statistics?.playerCount !== undefined) cachedPlanets[idx].players = raw.statistics.playerCount;
            if (raw.health !== undefined) cachedPlanets[idx].currentHealth = raw.health;
            if (raw.maxHealth !== undefined) cachedPlanets[idx].maxHealth = raw.maxHealth;
        }

        //update player count span if it's currently in the DOM (homepage cards)
        const playerEl = document.getElementById(`planet-players-${idx}`);
        if (playerEl && raw.statistics?.playerCount !== undefined) {
            const newCount = raw.statistics.playerCount;
            playerEl.textContent = newCount.toLocaleString();

            //also update the "X% of all divers" percentage
            if (liveState.totalPlayers > 0) {
                const pctEl = document.getElementById(`planet-pct-${idx}`);
                if (pctEl) {
                    const pct = (newCount / liveState.totalPlayers) * 100;
                    pctEl.style.width = `${Math.min(pct, 100)}%`;
                    pctEl.parentElement.dataset.pct = `${pct.toFixed(2)}%`;
                }
            }
        }

        //update liberation progress bar — covers both card and open modal (modal uses modal- prefix)
        if (raw.health !== undefined && raw.maxHealth) {
            const owner = cachedPlanets?.[idx]?.owner;
            let libPct = (raw.health / raw.maxHealth) * 100;
            if (owner && owner.toLowerCase() !== 'humans') libPct = 100 - libPct;
            libPct = Math.max(0, Math.min(100, libPct));

            for (const prefix of ['', 'modal-']) {
                const barEl = document.getElementById(`${prefix}liberation-bar-${idx}`);
                const pctEl = document.getElementById(`${prefix}liberation-pct-${idx}`);
                if (barEl) barEl.style.width = `${libPct}%`;
                if (pctEl) pctEl.textContent = libPct.toFixed(3);
            }
        }

        //update defender progress bar — defense events use their own health pool (raw.event)
        if (raw.event?.health !== undefined && raw.event?.maxHealth) {
            const defPct = Math.max(0, Math.min(100, (1 - (raw.event.health / raw.event.maxHealth)) * 100));

            for (const prefix of ['', 'modal-']) {
                const barEl = document.getElementById(`${prefix}defender-bar-${idx}`);
                const pctEl = document.getElementById(`${prefix}defender-pct-${idx}`);
                if (barEl) barEl.style.width = `${defPct}%`;
                if (pctEl) pctEl.textContent = defPct.toFixed(3);
            }
        }
    });
}

function applyTrendIndicators(previousSnapshot, currentSnapshot) {
    if (!previousSnapshot?.planets || !currentSnapshot?.planets) return;

    const dtSec = (currentSnapshot.timestamp - previousSnapshot.timestamp) / 1000;
    if (dtSec < 1) return;

    //build lookups of previous values by planet index
    const prevByIndex = {};
    const prevRegenByIndex = {};
    previousSnapshot.planets.forEach(p => {
        prevByIndex[p.index] = p.statistics?.playerCount ?? 0;
        prevRegenByIndex[p.index] = p.regenPerSecond ?? 0;
    });

    currentSnapshot.planets.forEach(curr => {
        const currCount = curr.statistics?.playerCount ?? 0;
        const prevCount = prevByIndex[curr.index] ?? currCount;
        const delta = currCount - prevCount;
        const ratePer60s = (delta / dtSec) * 60;

        //store per-second rate for smooth interpolation between ticks
        liveState.rates[curr.index] = ratePer60s / 60;

        const trendEl = document.getElementById(`planet-trend-${curr.index}`);
        if (trendEl) {
            //only show trend indicator if the change is meaningful (>= 5 players per minute)
            const roundedRate = Math.round(ratePer60s);
            if (Math.abs(roundedRate) < 5) {
                trendEl.textContent = '';
            } else if (delta > 0) {
                trendEl.textContent = `▲ ${Math.abs(roundedRate).toLocaleString()}`;
                trendEl.style.color = 'var(--success-color)';
            } else {
                trendEl.textContent = `▼ ${Math.abs(roundedRate).toLocaleString()}`;
                trendEl.style.color = 'var(--automaton-color)';
            }
        }

        //regen trend — show if regen rate changed between ticks
        const regenTrendEl = document.getElementById(`planet-regen-trend-${curr.index}`);
        if (regenTrendEl) {
            const currRegen = curr.regenPerSecond ?? 0;
            const prevRegen = prevRegenByIndex[curr.index] ?? currRegen;
            if (currRegen > prevRegen) {
                regenTrendEl.textContent = '▲';
                regenTrendEl.style.color = 'var(--automaton-color)'; // regen up = bad
            } else if (currRegen < prevRegen) {
                regenTrendEl.textContent = '▼';
                regenTrendEl.style.color = 'var(--success-color)'; // regen down = good
            } else {
                regenTrendEl.textContent = '';
            }
        }
    });
}

async function liveRefreshTick() {
    try {
        const snapshot = await fetchLiveSnapshot();
        if (!snapshot) return;

        liveState.previous = liveState.current;
        liveState.current = snapshot;

        applyLiveSnapshot(snapshot);

        //record baseline for interpolation
        liveState.lastTickTime = Date.now();
        snapshot.planets.forEach(p => {
            liveState.lastTickCounts[p.index] = p.statistics?.playerCount ?? 0;
        });

        if (liveState.previous) {
            applyTrendIndicators(liveState.previous, liveState.current);
        }

        console.log('[Live Refresh] Updated at', new Date().toLocaleTimeString());
    } catch (e) {
        console.warn('[Live Refresh] Tick failed, trying static fallback:', e);
        try {
            const [planetsRes, statsRes] = await Promise.all([
                fetch('/static-api/planets.json'),
                fetch('/static-api/galaxy_stats.json'),
            ]);
            if (!planetsRes.ok || !statsRes.ok) return;
            const staticPlanets = await planetsRes.json();
            const staticStats = await statsRes.json();
            const fallbackSnapshot = {
                planets: Object.values(staticPlanets).map(p => ({
                    index: p.index,
                    health: p.currentHealth,
                    maxHealth: p.maxHealth,
                    statistics: { playerCount: p.players ?? 0 },
                    regenPerSecond: parseFloat(p.regenPerSecond) || 0,
                    event: null,
                })),
                war: { statistics: { playerCount: staticStats.totalPlayers ?? 0 } },
                timestamp: Date.now(),
            };
            applyLiveSnapshot(fallbackSnapshot);
            console.warn('[Live Refresh] Displaying static snapshot as fallback.');
        } catch (fe) {
            console.warn('[Live Refresh] Static fallback also failed:', fe);
        }
    }
}

function interpolateCounts() {
    if (!liveState.lastTickTime || Object.keys(liveState.rates).length === 0) return;

    const elapsed = (Date.now() - liveState.lastTickTime) / 1000; // seconds since last tick

    for (const [idxStr, ratePerSec] of Object.entries(liveState.rates)) {
        const idx = parseInt(idxStr, 10);
        const base = liveState.lastTickCounts[idx];
        if (base === undefined) continue;

        const el = document.getElementById(`planet-players-${idx}`);
        if (!el) continue;

        const estimated = Math.max(0, Math.round(base + ratePerSec * elapsed));
        el.textContent = estimated.toLocaleString();
    }
}

function startLiveRefresh() {
    liveRefreshTick(); // run immediately on load
    setInterval(liveRefreshTick, 60 * 1000); // full tick every 60 seconds
    setInterval(interpolateCounts, 50); // visual interpolation every 50ms
}

async function loadMoLookups() {
    if (moLookups) return moLookups;
    try {
        const res = await fetch('/static-api/mo_lookups.json');
        if (res.ok) moLookups = await res.json();
    } catch (e) {}
    return moLookups;
}

// Mirrors the logic in major_order_parser.py / _resolve_task_details_by_type.
// Converts raw task objects from the live API into the same shape the
// render functions expect (typeName, factionId, goal, targetName, etc.).
function parseLiveMoTasks(rawTasks, progress, lookups, planetCache) {
    if (!lookups || !rawTasks?.length) return [];
    const { taskTypes, valueTypes, factions } = lookups;

    // Build reverse map: field name → integer key (mirrors Python's get_value_key)
    const reverseValueMap = {};
    for (const [id, name] of Object.entries(valueTypes || {})) {
        reverseValueMap[name] = parseInt(id);
    }
    const factionKey      = reverseValueMap['faction']       ?? null;
    const goalKey         = reverseValueMap['goal']          ?? null;
    const locationIdxKey  = reverseValueMap['locationIndex'] ?? null;
    const locationTypeKey = reverseValueMap['locationType']  ?? null;
    const targetIdKey     = reverseValueMap['targetId']      ?? null;

    return rawTasks.map((task, i) => {
        const values       = task.values     || [];
        const valueTypeIds = task.valueTypes || [];

        // Pair each valueType ID with its value (mirrors Python's dict(zip(...)))
        const valueMap = {};
        valueTypeIds.forEach((typeId, idx) => { valueMap[typeId] = values[idx]; });

        const typeId   = String(task.type);
        const typeName = taskTypes?.[typeId] || '';

        const factionId     = factionKey      !== null ? (valueMap[factionKey]      ?? null) : null;
        const goalRaw       = goalKey         !== null ? (valueMap[goalKey]         ?? null) : null;
        const enemyId       = targetIdKey     !== null ? (valueMap[targetIdKey]     ?? null) : null;
        const locationIndex = locationIdxKey  !== null ? (valueMap[locationIdxKey]  ?? null) : null;
        const locationType  = locationTypeKey !== null ? (valueMap[locationTypeKey] ?? null) : null;

        const planet      = locationIndex !== null ? (planetCache?.[locationIndex] || null) : null;
        // Planet index 0 is always Super Earth — it's not in the war planet list so
        // it won't appear in planetCache, but it can still be a valid MO target.
        const planetName  = planet?.name || (locationIndex === 0 ? 'Super Earth' : null);
        const factionName = factionId !== null ? (factions?.[String(factionId)] || null) : null;

        let targetName    = '';
        let targetPlanetId = null;

        if (typeName === 'Liberate' || typeName === 'Defense') {
            if (locationType === 1 && planetName) {
                targetName = planetName; targetPlanetId = locationIndex;
            } else if (locationType === 2) {
                targetName = 'Designated Sector';
            } else {
                targetName = 'Across the Galaxy';
            }
        } else if (typeName === 'Hold') {
            if (locationType === 1 && planetName) {
                targetName = planetName; targetPlanetId = locationIndex;
            }
        } else if (typeName === 'KillEnemies') {
            targetName = factionName || '';
        } else if (['CompleteObjs', 'CompleteOps', 'Extract'].includes(typeName)) {
            if (planetName) { targetName = planetName; targetPlanetId = locationIndex; }
        }

        // Fallback
        if (!targetName && planetName)  { targetName = planetName; targetPlanetId = locationIndex; }
        else if (!targetName && factionName) { targetName = `Target: ${factionName}`; }

        return {
            type: typeId, typeName, factionId, enemyId,
            goal: goalRaw ?? 1,
            progress: progress?.[i] ?? 0,
            targetName, targetPlanetId,
        };
    });
}

// Fetches major orders directly from the live API, parses tasks using the
// lookup tables in mo_lookups.json, and returns data in the same shape as
// major_orders.json so the existing render functions need no changes.
async function fetchLiveMajorOrders() {
    const config = await loadApiConfig();
    if (!config?.assignmentsUrl) return null;
    try {
        const [res, lookups, planetCache] = await Promise.all([
            fetch(config.assignmentsUrl, { headers: config.headers || {} }),
            loadMoLookups(),
            fetchPlanetData(),
        ]);
        if (!res.ok) {
            console.warn('[Live MO] Assignments fetch failed:', res.status, res.url);
            return null;
        }
        const raw = await res.json();
        console.log('[Live MO] Raw assignments response:', raw);
        if (!Array.isArray(raw)) return null;
        const now = Date.now();
        return raw.map(order => {
            const setting  = order.setting || {};
            const expiresIn = order.expiresIn ?? 0;
            const rewards  = Array.isArray(setting.rewards) ? setting.rewards
                           : (setting.reward ? [setting.reward] : []);
            const progress = order.progress || [];
            return {
                orderId:       order.id32 ?? order.id,
                orderExpires:  new Date(now + expiresIn * 1000).toISOString(),
                orderTitle:    setting.overrideTitle || 'Active Major Order',
                orderBriefing: setting.overrideBrief || setting.taskDescription || '',
                rewardsAmount: rewards[0]?.amount ?? null,
                tasks:         parseLiveMoTasks(setting.tasks || [], progress, lookups, planetCache),
            };
        });
    } catch (e) {
        console.warn('[Live MO] Fetch failed:', e);
        return null;
    }
}

// Primary source for major order data. Tries the live API first (with full
// task parsing), falls back to the static file if the live fetch fails.
async function getMajorOrderData() {
    const [liveResult, staticResult] = await Promise.allSettled([
        fetchLiveMajorOrders(),
        fetch('/static-api/major_orders.json').then(r => r.ok ? r.json() : [])
    ]);
    const live = liveResult.status === 'fulfilled' ? liveResult.value : null;
    const staticData = staticResult.status === 'fulfilled' ? (staticResult.value || []) : [];
    if (live && live.length > 0) return live;
    return staticData;
}

function main() {
    console.log('The page is loaded. Running main.js...')

    window.activeTimers = {};
    window.enemiesCache = null;

    siteNavigation();

    //loads homepage as default
    loadPageContent('#home');

    //starts the 60-second live data refresh loop
    startLiveRefresh();
}

function siteNavigation() {
    //collect all links in sidebar
    const navLinks = document.querySelectorAll('.sidebar-nav a');

    //loop through each link collected
    navLinks.forEach(link => {
        //listen for a click event
        link.addEventListener('click', (event) => {
            event.preventDefault();//stops browser's default behaviour
            
            //find which link was clicked
            const route = link.getAttribute('href');
            loadPageContent(route);

        })
    });
}

function toggleNav() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("menuOverlay");

    if (sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
        overlay.style.display = "none";
    } else {
        sidebar.classList.add('active');
        overlay.style.display = "block";
    }
}

function openPlanetOverlay(planetId) {
    const planet = window.planetCache && window.planetCache[planetId];
    if (!planet) return;

    const overlay = document.getElementById('planet-modal-overlay');
    const body = document.getElementById('planet-modal-body');
    if (!overlay || !body) return;

    const owner = planet.owner || 'Unknown';
    const ownerLower = owner.toLowerCase();
    let factionColor = '#6bb7ea';
    if (ownerLower === 'terminids') factionColor = '#ff9f00';
    else if (ownerLower === 'automaton') factionColor = '#fe6a67';
    else if (ownerLower === 'illuminate') factionColor = '#db58fb';

    const biomeName = planet.biomeName || 'Unknown';
    const biomeDesc = planet.biomeDescr;
    const formattedBiome = biomeName.toLowerCase().replace(/\s+/g, '_');

    const hazardsList = (planet.hazardName || []).map((name, i) => ({
        name,
        description: (planet.hazardDesc || [])[i] || ''
    }));

    const planetHazards = hazardsList.length > 0
        ? hazardsList.map(h => `
            <div class="planet-hazard">
                <strong>${h.name}</strong>
                <p style="font-size: 0.9em;">${h.description}</p>
            </div>`).join('')
        : '<span style="font-size:0.85em; opacity:0.6;">No hazards on this planet.</span>';


    let avatarGlowClass = '';
    if (ownerLower.includes('humans') || ownerLower.includes('earth')) avatarGlowClass = 'avatar-glow-super-earth';
    else if (ownerLower.includes('terminids')) avatarGlowClass = 'avatar-glow-terminid';
    else if (ownerLower.includes('automaton')) avatarGlowClass = 'avatar-glow-automaton';
    else if (ownerLower.includes('illuminate')) avatarGlowClass = 'avatar-glow-illuminate';

    let statusHtml = '';
    if (planet.isUnderAttack) {
        const defenderProgress = (1 - (planet.currentHealth / planet.maxHealth)) * 100;

        const now = Math.floor(Date.now() / 1000);
        const eventStartTimeUnix = new Date(planet.eventStartTime).getTime() / 1000;
        const eventEndTimeUnix = new Date(planet.eventEndTime).getTime() / 1000;
        const attackerProgress = Math.min(100, ((now - eventStartTimeUnix) / (eventEndTimeUnix - eventStartTimeUnix)) * 100);

        let attackerColor = factionColor; // fall back to owner's color (e.g. Helldivers attacking an enemy planet)
        if (planet.attackingFaction === 'Terminids') attackerColor = '#ff9f00';
        else if (planet.attackingFaction === 'Automaton') attackerColor = '#fe6a67';
        else if (planet.attackingFaction === 'Illuminate') attackerColor = '#db58fb';

        statusHtml = `
            <div class="progress-bar-container planet-modal-progress-bar">
                <div class="progress-bar-text"><span id="modal-defender-pct-${planet.index}">${defenderProgress.toFixed(3)}</span>% Helldivers Progress</div>
                <div class="progress-bar defender-bar" id="modal-defender-bar-${planet.index}" style="width:${defenderProgress}%;"></div>
            </div>
            <div class="progress-bar-container planet-modal-progress-bar">
                <div class="progress-bar-text">${attackerProgress.toFixed(3)}% ${planet.attackingFaction} progress</div>
                <div class="progress-bar attacker-bar" style="width:${attackerProgress}%; background-color:${attackerColor} !important;"></div>
            </div>`;
    } else {
        let libProgress = (planet.currentHealth / planet.maxHealth) * 100;
        if (ownerLower !== 'humans') libProgress = 100 - libProgress;
        libProgress = Math.max(0, Math.min(100, libProgress));
        statusHtml = `
            <div class="progress-bar-container planet-modal-progress-bar">
                <div class="progress-bar-text"><span id="modal-liberation-pct-${planet.index}">${libProgress.toFixed(3)}</span>% liberated</div>
                <div class="progress-bar liberation-bar" id="modal-liberation-bar-${planet.index}" style="width:${libProgress}%; background-color:${factionColor} !important;"></div>
            </div>`;
    };

    const planetTotalKills = planet.bugKills + planet.botKills + planet.squidKills;
    const planetKDR = (planetTotalKills / planet.deaths).toFixed(3);

    body.innerHTML = `
        <div class="planet-modal-main-row">
            <div class="planet-modal-left">
                <div style="display:inline-flex; flex-direction:column; align-items:center; margin-bottom:8px;">
                    <div class="planet-avatar-container ${avatarGlowClass}" style="width:120px; height:120px; margin-bottom:16px;">
                        <img src="/static/src/images/planets/${formattedBiome}.webp" alt="${biomeName}" class="planet-avatar" onerror="this.src='/static/src/images/planets/moon.webp'">
                        <img src="/static/src/images/planets/planet_grid.gif" class="planet-grid-overlay" alt="">
                    </div>
                    <h3 style="color:${factionColor}; font-size:1.8rem; margin:0; text-shadow:2px 2px 2px #000;">${planet.name}</h3>
                    <p style="margin: 6px 0 0 0; display: flex; align-items: center; justify-content: center;"><img src="/static/src/images/hd2-skull.png" alt="" class="icon-label"><span class="helldiver-color" style="font-size: 1.3rem; margin-left: 8px;">${(planet.players || 0).toLocaleString()}</span><span style="width:calc(1.1em + 24px + 6px); flex-shrink:0;"></span></p>
                </div>
                <p><strong>Owner:</strong> <span style="color:${factionColor};">${owner}</span></p>
                <p><strong>Sector:</strong> ${planet.sector || 'Unknown'}</p>
                <p><strong>Health:</strong> ${(planet.currentHealth).toLocaleString()} / ${(planet.maxHealth).toLocaleString()}</p>
                <p><strong>Regen Per Sec:</strong> ${parseFloat(planet.regenPerSecond || 0).toFixed(3)}</p>
                <p><strong>Time Played:</strong> ${planet.missionTime}</p>
            </div>
            <div class="planet-modal-info-box">
                <div class="info-box-stats">
                    <p><strong class="terminid-color">Terminid Kills:</strong> ${(planet.bugKills || 0).toLocaleString()}</p>
                    <p><strong class="automaton-color">Automaton Kills:</strong> ${(planet.botKills || 0).toLocaleString()}</p>
                    <p><strong class="illuminate-color">Illuminate Kills:</strong> ${(planet.squidKills || 0).toLocaleString()}</p>
                    <p><strong>Deaths:</strong> <span style="color: #fe6a67;">${(planet.deaths || 0).toLocaleString()}</span></p>
                    <p><strong>Kill/Death Ratio:</strong> ${planetKDR}</p>
                    <p><strong>Friendly Fire:</strong> ${(planet.friendlies || 0).toLocaleString()}</p>
                    <p><strong>Missions Won/Lost:</strong> <span style="color: #25c225;">${(planet.missionsWon || 0).toLocaleString()}</span> | <span style="color: #fe6a67">${(planet.missionsLost).toLocaleString()}</span></p>
                    <p><strong>Missions Total:</strong> ${(planet.missionsWon + planet.missionsLost || 0).toLocaleString()}</p>
                    <p><strong>Bullets Fired:</strong> ${(planet.bulletsFired || 0).toLocaleString()}</p>
                    <p><strong>Bullets Hit:</strong> ${(planet.bulletsHit || 0).toLocaleString()}</p>
                    <hr>
                    <p><strong>${biomeName}</strong><p>
                    <p style="font-size: 0.9em; margin-top: 2px; margin-bottom: 12px;">${biomeDesc}</p>
                    <hr>
                    <strong style="text-align: center; font-size: 1.0em; padding-top: 0;">Hazards</strong>
                    <p>${planetHazards}</p>
                </div>
            </div>
            <div class="player-graph-wrapper">
                <span class="player-graph-title">PLAYERS</span>
                <canvas id="player-graph-canvas" class="player-graph-canvas"></canvas>
            </div>
        </div>
        ${statusHtml}
    `;

    const modalContent = overlay.querySelector('.planet-modal-content');
    if (modalContent) {
        const landscapeName = biomeName.replace(/\s+/g, '_');
        modalContent.style.backgroundImage = `linear-gradient(to bottom, rgba(34,34,34,0.35) 0%, rgba(34,34,34,0.75) 45%, rgb(34,34,34) 72%), url('/static/src/images/landscapes/${landscapeName}.png')`;
        modalContent.style.backgroundSize = 'cover';
        modalContent.style.backgroundPosition = 'center top';
        modalContent.style.backgroundRepeat = 'no-repeat';
    }

    overlay.classList.add('active');

    fetchAndDrawPlayerGraph(planet.index, factionColor, planet.players || 0);
}

async function fetchAndDrawPlayerGraph(planetIndex, factionColor, currentPlayers) {
    // Wait one animation frame so the grid layout has resolved before measuring
    await new Promise(resolve => requestAnimationFrame(resolve));

    const canvas = document.getElementById('player-graph-canvas');
    if (!canvas) return;

    // Set title immediately from live player count
    const titleEl = canvas.closest('.player-graph-wrapper')?.querySelector('.player-graph-title');
    if (titleEl) titleEl.textContent = `PLAYERS (${currentPlayers.toLocaleString()})`;

    const ctx = canvas.getContext('2d');

    // Size canvas to its CSS-rendered dimensions
    const rect = canvas.getBoundingClientRect();
    canvas.width  = Math.round(rect.width)  || 200;
    canvas.height = Math.round(rect.height) || 120;

    const W = canvas.width;
    const H = canvas.height;

    // Draw loading state
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,231,16,0.25)';
    ctx.font = '11px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('Loading...', W / 2, H / 2);

    let data;
    try {
        const res = await fetch(`/static-api/player_history/${planetIndex}.json`);
        data = await res.json();
    } catch {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#fe6a67';
        ctx.font = '11px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText('Failed to load data', W / 2, H / 2);
        return;
    }

    if (!data || data.length === 0) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(255,231,16,0.4)';
        ctx.font = '11px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText('No history data', W / 2, H / 2);
        return;
    }

    const points = drawPlayerGraph(ctx, W, H, data, factionColor);

    // --- Hover interaction ---
    if (canvas._pgMousemove) {
        canvas.removeEventListener('mousemove', canvas._pgMousemove);
        canvas.removeEventListener('mouseleave', canvas._pgMouseleave);
    }

    canvas._pgMousemove = function(e) {
        const r = canvas.getBoundingClientRect();
        const scaleX = canvas.width / r.width;
        const scaleY = canvas.height / r.height;
        const mx = (e.clientX - r.left) * scaleX;
        const my = (e.clientY - r.top) * scaleY;

        let closest = null;
        let minDist = Infinity;
        points.forEach((p, i) => {
            const dist = Math.hypot(p.x - mx, p.y - my);
            if (dist < minDist) { minDist = dist; closest = i; }
        });

        drawPlayerGraph(ctx, W, H, data, factionColor);

        if (closest !== null && minDist < 24) {
            const p = points[closest];
            const count = data[closest].playerCount.toLocaleString();
            const label = `${count}`;
            ctx.font = 'bold 10px Courier New';
            const tw = ctx.measureText(label).width;
            const PAD_TIP = 5;
            const tipW = tw + PAD_TIP * 2;
            const tipH = 16;
            let tx = p.x - tipW / 2;
            let ty = p.y - tipH - 8;
            if (tx < 0) tx = 0;
            if (tx + tipW > W) tx = W - tipW;
            if (ty < 0) ty = p.y + 8;

            ctx.fillStyle = 'rgba(20,20,20,0.85)';
            ctx.beginPath();
            ctx.roundRect(tx, ty, tipW, tipH, 3);
            ctx.fill();

            const accent = factionColor || '#ffe710';
            ctx.fillStyle = accent;
            ctx.textAlign = 'left';
            ctx.fillText(label, tx + PAD_TIP, ty + tipH - 4);

            // Highlight the hovered dot
            ctx.strokeStyle = accent;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.stroke();
        }
    };

    canvas._pgMouseleave = function() {
        drawPlayerGraph(ctx, W, H, data, factionColor);
    };

    canvas.addEventListener('mousemove', canvas._pgMousemove);
    canvas.addEventListener('mouseleave', canvas._pgMouseleave);
}

function drawPlayerGraph(ctx, W, H, data, factionColor) {
    const PAD = { top: 8, right: 10, bottom: 22, left: 40 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const counts = data.map(d => d.playerCount);
    const minCount = Math.min(...counts);
    const maxCount = Math.max(...counts);
    const countRange = maxCount - minCount || 1;


    const accent = factionColor || '#ffe710';

    ctx.clearRect(0, 0, W, H);

    // --- Grid lines (horizontal) ---
    const Y_TICKS = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    for (let i = 0; i <= Y_TICKS; i++) {
        const y = PAD.top + plotH - (i / Y_TICKS) * plotH;
        ctx.beginPath();
        ctx.moveTo(PAD.left, y);
        ctx.lineTo(PAD.left + plotW, y);
        ctx.stroke();
    }

    // --- Y-axis labels ---
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '10px Courier New';
    ctx.textAlign = 'right';
    for (let i = 0; i <= Y_TICKS; i++) {
        const val = Math.round(minCount + (i / Y_TICKS) * countRange);
        const y = PAD.top + plotH - (i / Y_TICKS) * plotH;
        const label = val >= 1000 ? `${(val / 1000).toFixed(1)}k` : `${val}`;
        ctx.fillText(label, PAD.left - 3, y + 3.5);
    }

    // --- Points evenly spaced by index so they align with date labels ---
    const n = data.length;
    const points = data.map((d, i) => ({
        x: PAD.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW),
        y: PAD.top + plotH - ((counts[i] - minCount) / countRange) * plotH
    }));

    // --- X-axis date labels aligned to each point ---
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '10px Courier New';
    data.forEach((_d, i) => {
        const dt = new Date(data[i].timestamp);
        const label = `${(dt.getUTCMonth()+1).toString().padStart(2,'0')}/${dt.getUTCDate().toString().padStart(2,'0')}`;
        ctx.textAlign = i === 0 ? 'left' : i === n - 1 ? 'right' : 'center';
        ctx.fillText(label, points[i].x, H - 4);
    });

    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    // --- Dots at each data point ---
    ctx.setLineDash([]);
    ctx.fillStyle = accent;
    points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
    });

    // --- Highlight latest point ---
    const last = points[points.length - 1];
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
    ctx.stroke();

    return points;
}

function closePlanetOverlay() {
    const overlay = document.getElementById('planet-modal-overlay');
    if (overlay) overlay.classList.remove('active');
}

function updatePageTitle(route) {
    const display = document.getElementById('current-page-title');
    const currentRoute = route || window.location.hash || '#home';

    const titles = {
        '': 'Home',
        '#home': 'Home',
        '#planets': 'All Planets',
        '#galactic_map': 'Galactic Map',
        '#galaxy_stats': 'Galaxy Stats',
        '#major_orders': 'Major Orders',
        '#changelog': 'CHANGELOG',
        '#amoury': 'Armoury',
    };

    if (titles[currentRoute] !== undefined) {
        display.textContent = titles[currentRoute];
    } else {
        display.textContent = currentRoute.replace('#', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
}



//routes user's link interactions
function loadPageContent(route) {
    console.log(`Loading content for: ${route}`);

    updatePageTitle(route);
    const contentArea = document.querySelector('.content-area');
    if (!contentArea) return;

    contentArea.innerHTML = '';

    switch (route) {
        case '#home':
            renderHomePage(contentArea);
            break;
        case '#galaxy_stats':
            renderGalaxyStats(contentArea);
            break;
        case '#major_orders':
            renderMajorOrderPage(contentArea);
            break;
        case '#planets':
            renderPlanetsPage(contentArea);
            break;
        case '#changelog':
            renderChangelog(contentArea);
            break;
        case '#galactic_map':
            renderGalacticMap(contentArea);
            break;
        case '#armoury':
            renderArmoury(contentArea);
            break;
        default:
            if (route === '' || route === undefined) {
                renderHomePage(contentArea);
            } else {
                contentArea.innerHTML = '<h2>404 - Page Not Found</h2>';
            }
    }
}



/*  
    ============================================
    CONTENT RENDERING FUNCTIONS
    ============================================
*/

//renders homepage
async function renderHomePage(contentArea) {
    try {
        const [planetData, moData, statsResponse, enemiesData, dispatchData] = await Promise.all([
            fetchPlanetData(),
            getMajorOrderData(),
            fetch('/static-api/galaxy_stats.json'),
            fetchEnemiesData(),
            fetchDispatchData()
        ]);

        if (!statsResponse.ok) throw new Error('Failed to fetch galaxy stats');
        const statsData = await statsResponse.json();
        const dispatchList = dispatchData;
        const recentDispatches = [...dispatchList]
            .sort((a, b) => b.id - a.id)
            .slice(0, 12);

        //process collected >>PLANET<< data
        window.planetCache = planetData;
        const planetsArray = Object.values(planetData);

        planetsArray.sort((a,b) => b.players - a.players); //sort by most players to least
        const mostPopulatedPlanets = planetsArray.slice(0, 8);
        //console.log(`Length of collected planet list: ${mostPopulatedPlanets}`);
       

        //collect all active (non-expired) orders
        const now = Date.now();
        const orders = (Array.isArray(moData) ? moData : []).filter(order => {
            if (!order.orderExpires) return true;
            return new Date(order.orderExpires).getTime() > now;
        });

        //process collected >>GALAXY<< stats
        //variable declaration
        const bugKills = statsData.terminidKills || 0; 
        const botKills = statsData.automatonKills || 0;
        const squidKills = statsData.illuminateKills || 0;
        const totalKills = bugKills + botKills + squidKills;
        const bugPercent = ((bugKills / totalKills) * 100).toFixed(2);
        const botPercent = ((botKills / totalKills) * 100).toFixed(2);
        const squidPercent = ((squidKills / totalKills) * 100).toFixed(2);
        const diverDeaths = statsData.deaths || 0;
        const avgKillsPerLife = (totalKills / diverDeaths).toFixed(1);


        //================BUILD HTML================//
        let html = '<h2>Home</h2>';

        //TOP ROW CONTAINER
        html += `<div class="top-row-container">`;

        //MO SUMMARY-- in top-row-container
        if (orders.length > 0) {
            html += `<div class="homepage-card mo-card">`;

            orders.forEach((order, index) => {
                html += `
                    <h3 style="text-shadow: 2px 2px 2px #000;">${order.orderTitle}</h3>
                    <p>${order.orderBriefing}</p>
                    <div class="mo-tasks">
                        <h3 style="color: #ffe710; border-bottom: 1px solid #ffe710;">Objectives</h3>
                `;

                if (order.tasks && order.tasks.length > 0) {
                    order.tasks.forEach(task => {
                        const taskPlanet = planetData[task.targetPlanetId] || {};
                        html += checkTaskProgressHTML(task, taskPlanet, enemiesData);
                    });
                } else {
                    html += "<p>No specific tasks data available.</p>";
                }

                html += `
                    </div>
                    <p><strong>Expires:</strong> <span id="homepage-mo-timer-${order.orderId}">${order.orderExpires}</span></p>
                    <p><strong>Reward:</strong> ${order.rewardsAmount ?? 0} Medals</p>
                    ${index < orders.length - 1 ? '<hr style="border: none; border-top: 2px solid #ffe710; margin: 12px 0;">' : ''}
                `;
            });

            html += `</div>`;
        } else {
            html += `
                <div class="homepage-card mo-card">
                    <h3>Active Major Order(s)</h3>
                    <p>There are currently no active Major Orders at this time. Check back soon, Helldiver!</p>
                </div>
                `;
        }

        // MOST ACTIVE PLANETS SUMMARY--
        html += `
            <div class="homepage-card top-container">
                <h3 style="font-weight: bold; margin-top: 16px; margin-bottom: 10px; text-shadow: 2px 2px 2px #000;">MOST ACTIVE PLANETS</h3>
                <div class="stats-layout">`; // <-- USE GRID LAYOUT

        const defenseTimersToStart = [];

        mostPopulatedPlanets.forEach((planet, index) => {
            const isExtra = index >= 6;
            let factionClass = '';
            const ownerId = planet.owner;

            if (ownerId === 'Terminids') {
                factionClass = '#ff9f00';
            } else if (ownerId === 'Automaton') {
                factionClass = '#fe6a67';
            } else if (ownerId === 'Illuminate') {
                factionClass = '#db58fb';
            } else {
                factionClass = '#6bb7ea';
            }

            //checks for planet campaigns
            let defenseClass = '';
            let healthBarHtml = '';
            let defenseTimerHtml = '';


            // DEFENSE CAMPAIGNS ===========
            const defenseExpired = planet.eventEndTime && new Date(planet.eventEndTime).getTime() < Date.now();
            if (planet.isUnderAttack && !defenseExpired) {
                defenseClass = 'is-defending';

                const timerId = `defense-timer-${planet.index}`
                defenseTimerHtml = `<p class="defense-timer" style="color: ${factionClass}; font-weight: bold;"><span id="${timerId}">Loading...</span></p>`;

                defenseTimersToStart.push({
                    id: timerId,
                    time: planet.eventEndTime
                });

                // High hp = good for SE
                const now = Math.floor(Date.now() / 1000); // divide by 1000 for seconds as lowest value
                const eventStartTimeUnix = new Date(planet.eventStartTime).getTime() / 1000;
                const eventEndTimeUnix = new Date(planet.eventEndTime).getTime() / 1000;

                const defenderProgress = (1 - (planet.currentHealth / planet.maxHealth)) * 100;
                const attackerProgress = ((now - eventStartTimeUnix) / (eventEndTimeUnix - eventStartTimeUnix)) * 100;

                const helldiverPercentStr = defenderProgress.toFixed(3);
                const attackingPercentStr = attackerProgress.toFixed(3);

                factionColor = '';
                const attackingFaction = planet.attackingFaction
                if (attackingFaction === 'Terminids') {factionColor = '#ff9f00';} 
                else if (attackingFaction === 'Automaton') {factionColor = '#fe6a67';} 
                else if (attackingFaction === 'Illuminate') {factionColor = '#db58fb';}


                // HANDLES PROGRESSION BARS
                healthBarHtml += `
                    <div class="progress-bar-container" style="position: relative;">
                        <div class="progress-bar-text" style="position: absolute; width: 100%; font-size: 0.75rem; text-align: center; z-index: 10; color: white; text-shadow: 1px 1px 2px black; ">
                            <span id="defender-pct-${planet.index}" style="font-size: 1em;">${helldiverPercentStr}</span>%
                        </div>

                        <div class="progress-bar defender-bar" id="defender-bar-${planet.index}" style="width: ${defenderProgress}%;"></div>
                    </div>
                    <div class="progress-bar-container" style="position: relative;">
                        <div class="progress-bar-text" style="position: absolute; width: 100%; font-size: 0.75rem; text-align: center; z-index: 10; color: white; text-shadow: 1px 1px 2px black; ">
                            <span id="attacker-pct-${planet.index}" style="font-size: 1em;">${attackingPercentStr}</span>%
                        </div>
                    
                        <div class="progress-bar attacker-bar" style="width: ${attackerProgress}%; background-color: ${factionColor || factionClass} !important;"></div>
                    </div>
                `;
            } else {
                let liberationProgress = (planet.currentHealth / planet.maxHealth) * 100;
                if (ownerId !== 1) {
                    liberationProgress = 100 - liberationProgress;
                }

                liberationProgress = Math.max(0, Math.min(100, liberationProgress))

                healthBarHtml += `
                    <div class="progress-bar-container">
                        <div class="progress-bar-text" style="position: absolute; width: 100%; font-size: 0.75rem; text-align: center; z-index: 10; color: white; text-shadow: 1px 1px 2px black; line-height: 1.5em;">
                            <span id="liberation-pct-${planet.index}">${liberationProgress.toFixed(3)}</span>%
                        </div>
                        <div class="progress-bar liberation-bar" id="liberation-bar-${planet.index}" style="width: ${liberationProgress}%; background-color: ${factionClass} !important;"></div>
                    </div>
                `;
            }

            const playerPercent = ((planet.players / statsData.totalPlayers) * 100).toFixed(2);

            html += `
                <div class="stat-card ${defenseClass}${isExtra ? ' extra-planet' : ''}"${isExtra ? ' style="display:none; cursor:pointer;"' : ' style="cursor:pointer;"'} data-biome="${planet.biomeName}" onclick="openPlanetOverlay(${planet.index})">
                    <div class="planet-card-header">
                        <div class="planet-regen-stat">
                            <span id="planet-regen-${planet.index}" style="color: ${factionClass};">${parseFloat(planet.regenPerSecond).toFixed(2)}/s</span>
                            <span id="planet-regen-trend-${planet.index}" class="regen-trend"></span>
                        </div>
                        <h3 style="color: ${factionClass};">${planet.name}</h3>
                        <div class="planet-player-stat">
                            <div style="display:flex; align-items:center; justify-content:flex-start; gap:4px;">
                                <img src="/static/src/images/hd2-skull.png" class="icon-label" alt="">
                                <span id="planet-players-${planet.index}" style="font-size: 1.15em;">${planet.players.toLocaleString()}</span>
                                <span id="planet-trend-${planet.index}" style="font-size: 0.85em;"></span>
                            </div>
                            <div class="player-pct-bar-container" data-pct="${playerPercent}%">
                                <div class="player-pct-bar" id="planet-pct-${planet.index}" style="width:${Math.min(playerPercent, 100)}%;"></div>
                            </div>
                        </div>
                    </div>
                    <div class="health-bar">
                        ${healthBarHtml}
                    </div>
                    <div class="defense-timer">
                        ${defenseTimerHtml}
                    </div>
                    <div class>
                    </div>
                </div>`;
        });

        html += `</div>`; // closes stats-layout grid
        html += `</div>`; // closes planet homepage card

        
        //KILL STATS SUMMARY
        html += `
            <div class="homepage-card">
                <h3 style="font-weight: bold; margin-top: 16px; margin-bottom: 10px; text-shadow: 2px 2px 2px #000;">WAR EFFORT SUMMARY</h3>
                <div style="text-align: center; font-size: 1.1em; font-weight: bolder;">
                    Helldivers Online: <span class="helldiver-color">${statsData.totalPlayers.toLocaleString()}</span><br>
                </div>
                <div class="stats-summary-grid" style="border: none; background: none;">
                    <div class="stat-card war-effort">
                        <div style="text-align: center; font-size: 1rem; font-weight: bold; color: whitesmoke;">
                            <span style="font-weight: bolder; color: whitesmoke">Total Kills Summary</span><br>
                            <span class="terminid-color">${bugKills.toLocaleString()} (${bugPercent.toLocaleString()}%)</span><br>
                            <span class="automaton-color">${botKills.toLocaleString()} (${botPercent.toLocaleString()}%)</span><br>
                            <span class="illuminate-color">${squidKills.toLocaleString()} (${squidPercent.toLocaleString()}%)</span><br>
                            <span class="helldiver-color">${totalKills.toLocaleString()}</span> total<br>
                            <hr>
                            Average KD: <span class="helldiver-color">${avgKillsPerLife.toLocaleString()}</span> : <span class="automaton-color">1</span><br>
                            Total Deaths: <span class="automaton-color">${statsData.deaths.toLocaleString()}</span><br>
                        </div>
                    </div>
                    <div class="stat-card war-effort">
                        <div style="text-align: left; font-size: 1rem; font-weight: bold; color: whitesmoke;">
                            Bullets Fired: <span class="helldiver-color">${statsData.bulletsFired.toLocaleString()}</span><br>
                            Projectile Hits: <span class="helldiver-color">${statsData.bulletsHit.toLocaleString()}</span><br>
                            Helldiver Accuracy: <span class="helldiver-color">${statsData.accuracy.toLocaleString()}%</span><br>
                            <hr>
                            Missions Won: <span class="success-color">${statsData.missionsWon.toLocaleString()} (${statsData.missionsWonPercent.toLocaleString()}%)</span><br>
                            Missions Lost: <span class="automaton-color">${statsData.missionsLost.toLocaleString()}</span><br>
                            Missions Total: <span class="helldiver-color">${statsData.missionsTotal.toLocaleString()}</span><br>
                            Friendly Kills: <span class="automaton-color">${statsData.accidentals.toLocaleString()}<span>
                        </div>
                    </div>
                </div>
                
            </div>
        `;

        // DISPATCH NEWS
        let dispatchDataHtml = '';

        if (recentDispatches.length === 0) {
            dispatchDataHtml = '<p style="color: #777; font-style: italic; padding: 8px 0;">No recent dispatches available.</p>';
        } else {
            recentDispatches.forEach(dispatch => {
                const id = dispatch.id;
                const pubShort = dispatch.published_short;
                const pubFull = dispatch.published_full;
                const msg = dispatch.message;

                dispatchDataHtml += `
                    <div class="homepage-dispatch-data">
                        <div class="homepage-dispatch-pub-date" title="${pubFull}">
                            ${pubShort}
                        </div>
                        <div class="homepage-dispatch-msg-text">
                            ${msg}
                        </div>
                    </div>
                `;
            });
        }

        html += `
            <div class="homepage-card">
                <h3 style="font-weight: bold; margin-top: 16px; margin-bottom: 10px; text-shadow: 2px 2px 2px #000;">SUPER EARTH DISPATCH</h3>
                <div class="dispatch-summary-grid">
                    ${dispatchDataHtml}
                </div>
            </div>
        `;
        

        contentArea.innerHTML = html;

        //MO timers
        orders.forEach(order => {
            if (order.orderExpires) {
                expirationTimeCountdown(order.orderExpires, `homepage-mo-timer-${order.orderId}`);
            }
        });
        defenseTimersToStart.forEach(timer => {
            expirationTimeCountdown(timer.time, timer.id);
        });

        // Reveal extra planets (7+8) if the MO card leaves enough vertical gap
        requestAnimationFrame(() => {
            const moCard = contentArea.querySelector('.mo-card');
            const planetsCard = contentArea.querySelector('.top-container');
            const extraCards = contentArea.querySelectorAll('.extra-planet');

            if (moCard && planetsCard && extraCards.length > 0) {
                // CSS grid stretches both columns to equal height, so we must
                // read natural (unstretched) heights by opting out of stretch first
                moCard.style.alignSelf = 'start';
                planetsCard.style.alignSelf = 'start';
                const moHeight = moCard.offsetHeight;       // forces reflow
                const planetsHeight = planetsCard.offsetHeight;
                moCard.style.alignSelf = '';
                planetsCard.style.alignSelf = '';

                const gap = moHeight - planetsHeight;
                const sampleCard = planetsCard.querySelector('.stat-card');
                const cardMinHeight = sampleCard ? parseInt(getComputedStyle(sampleCard).minHeight) : 200;
                const cardRowHeight = cardMinHeight + 24; // 24 = grid gap

                if (gap >= cardRowHeight * 0.75) {
                    extraCards.forEach(el => el.style.display = '');
                }
            }
        });

    } catch (error) {
        console.error('Failed to load homepage:', error);
        contentArea.innerHTML = '<p style="color:red;">Error loading homepage data.</p>';
    }
}

//renders galaxy stats
async function renderGalaxyStats(contentArea) {
    //'try' and 'catch' are similar to 'try' and 'except'
    try {
        console.log('Fetching stats from /static-api/galaxy_stats.json...');
        const response = await fetch('/static-api/galaxy_stats.json');

        //check if network request was successful
        if (!response.ok) {
            throw new Error(`Network error: ${response.status}`);
            //sends error to catch block
        }

        //await to decode collected response as JSON
        const data = await response.json();
        // console.log('Sucessfully fetched galaxyStats:', data);
        
        //KILLS DATA
        const bugKills = data.terminidKills || 0; // || defaults to 0 if no stats can be found.
        const botKills = data.automatonKills || 0;
        const squidKills = data.illuminateKills || 0;
        const overallKills = bugKills + botKills + squidKills;

        //MISSIONS DATA
        const missionsWon = data.missionsWon || 0;
        const missionsLost = data.missionsLost || 0;
        const missionsTotal = missionsWon + missionsLost;
        const totalMissionTime = data.missionTime || 0;
        const missionsWinPercent = (missionsWon / missionsTotal) * 100;

        //HELLDIVER DATA
        const bulletsFired = data.bulletsFired || 0;
        const bulletsHit = data.bulletsHit || 0;
        const accuracy = data.accuracy || 0;
        const kdRatio = data.kdRatio || 0;
        const accidentals = data.accidentals || 0;

        contentArea.innerHTML = `
            <h2>Galactic Stats Summary</h2>
            <p>Freedom's greetings, Helldiver. Check out the current summary of our stats across the galaxy.</p>
            <div class="galaxy-stats-page-layout">
                <div class="stat-card">
                    <h3>Faction Kills</h3>
                    <p>Terminid Kills: <span class="terminid-color">${bugKills.toLocaleString()}</span></p>
                    <p>Automaton Kills: <span class="automaton-color">${botKills.toLocaleString()}</span></p>
                    <p>Illuminate Kills: <span class="illuminate-color">${squidKills.toLocaleString()}</span></p>
                    <h3>Total Kills</h3>
                    <p><span class="seaf-color">${overallKills.toLocaleString()}</span></p>
                </div>
                <div class="stat-card">
                    <h3>Missions Data</h3>
                    <p>Missions Won/Lost: <span class="success-color">${missionsWon.toLocaleString()}</span> / <span class="automaton-color">${missionsLost.toLocaleString()}</span></p>
                    <p>Win Percent: <span class="success-color">${missionsWinPercent.toLocaleString()}%</span></p>
                    <p>Total Mission Time: <span class="seaf-color">${totalMissionTime.toLocaleString()}</span></p>
                </div>
                <div class="stat-card">
                    <h3>Helldiver Data</h3>
                    <p>Bullets Fired: <span class="automaton-color">${bulletsFired.toLocaleString()}</span></p>
                    <p>Bullets Hit: <span class="success-color">${bulletsHit.toLocaleString()}</span></p>
                    <p>Accuracy: <span class="seaf-color">${accuracy.toLocaleString()}%</span></p>
                    <p>Av. KD Ratio: <span class="success-color">${kdRatio.toLocaleString()}</span> : <span class="automaton-color">1</span></p>
                    <p>Friendly Kills: <span class="automaton-color">${accidentals.toLocaleString()}</span></p>
                </div>
            </div>
        `;
    } catch (error) {
        //if try block fails, execute catch block
        console.error('Failed to fetch stats:', error);
        contentArea.innerHTML = '<p style="color: red;">Error: Could not load Galactic War stats. Is the API running?</p>';
    }
}

//renders major order page
async function renderMajorOrderPage(contentArea) {
    contentArea = contentArea || document.querySelector('.content-area');

    contentArea.innerHTML = '<h2>Loading Major Orders...</h2>'

    try {
        const [rawMoData, planetData, enemiesData] = await Promise.all([
            getMajorOrderData(),
            fetchPlanetData(),
            fetchEnemiesData()
        ]);

        //mo list — filter out expired orders
        const moNow = Date.now();
        const moData = (Array.isArray(rawMoData) ? rawMoData : []).filter(order => {
            if (!order.orderExpires) return true;
            return new Date(order.orderExpires).getTime() > moNow;
        });

        if (moData.length === 0) {
            contentArea.innerHTML = '<h2 style="color: whitesmoke; font-variant: small-caps;">No Active Orders</h2>';
            return;
        }

        let ordersHtml = '';

        //mo list loop
        for (const order of moData) {
            ordersHtml += `
                <div class="mo-page-container">
                    <h3>${order.orderTitle}</h3>
                    <div class="mo-page-description">
                        <p>${order.orderBriefing}</p>
                    </div>
                    <div class="mo-page-expiry">
                        <p><strong>Expires:</strong> <span id="mo-page-timer-${order.orderId}">${order.orderExpires}</span></p>
                        <p><strong>Reward:</strong> ${order.rewardsAmount} Medals</p>
                    </div>
                    <div class="mo-tasks">
                        <h3 style="color: #ffe710; border-bottom: 1px solid #ffe710;">Objectives</h3>
            `;

            if (order.tasks && order.tasks.length > 0) {
                order.tasks.forEach(task => {
                    const taskPlanet = planetData[task.targetPlanetId] || {};
                    ordersHtml += checkTaskProgressHTML(task, taskPlanet, enemiesData);
                });
            } else {
                ordersHtml += '<p>No specific tasks data available.</p>';
            }

            ordersHtml += `
                    </div>
                </div>
            `;
        }

        contentArea.innerHTML = ordersHtml;

        // Start countdown timers after DOM is populated
        moData.forEach(order => {
            if (order.orderExpires) {
                expirationTimeCountdown(order.orderExpires, `mo-page-timer-${order.orderId}`);
            }
        });

    }
    catch (error) {
        console.error('Failed to fetch major orders:', error);
        contentArea.innerHTML = '<p style="color:red;">Error loading Major Orders.</p>';
    }
}

//renders planet data page
async function renderPlanetsPage(contentArea) {
    try{
        const allPlanets = await fetchPlanetData();
        window.planetCache = allPlanets;

        let html = `
            <h2>All Planets</h2>

            <div class="planet-controls" style="margin-bottom: 20px; display: flex; gap: 15px;">
                <input type="text" id="planet-search" placeholder="Search for information..." class="filter-option-button">
                    <select id="sort-by" class="filter-option-button">
                        <option value="name">Alphabetical</option>
                        <option value="players">Total Players</option>
                        <option value="sectors">Sectors</option>
                        <option value="biomes">Biomes</option>
                        <option value="defending">Defending</option>
                    </select>

                    <select id="sort-order" class="filter-option-button">
                        <option value="asc">Ascending (A-Z | Low-High)</option>
                        <option value="desc">Descending (Z-A | High-Low)</option>
                    </select>
                
                    <select id="faction-filter" class="filter-option-button">
                        <option value="all">All Factions</option>
                        <option value="humans" style="color: #6bb7ea;">- Super Earth</option>
                        <option value="terminids" style="color: #ff9f00;">- Terminids</option>
                        <option value="automaton" style="color: #fe6a67;">- Automatons</option>
                        <option value="illuminate" style="color: #db58fb;">- Illuminate</option>
                    </select>
            </div>

            <div id="planet-grid-container">
        `;

        const planetsArray = Object.values(allPlanets);

        const sectorStatuses = analyzeSectors(planetsArray)

        planetsArray.forEach((planet, index) => {

            let factionClass = '';
            const ownerFaction = planet.owner.toLowerCase();
            if (ownerFaction === 'terminids') {
                factionClass = 'terminid-color';
            } else if (ownerFaction === 'automaton') {
                factionClass = 'automaton-color';
            } else if (ownerFaction === 'illuminate') {
                factionClass = 'illuminate-color';
            } else {
                factionClass = 'seaf-color';
            }

            const thisSector = sectorStatuses[planet.sector];

            let sectorCssClass = '';
            let avatarGlowClass = '';

            const owner = planet.owner.toLowerCase();

            if (thisSector.state === "contested") {
                sectorCssClass = "contested-text-pulse";

            } else {
                if (owner.includes("earth") || owner === "humans") sectorCssClass = "text-super-earth";
                else if (owner.includes("terminids") || owner === "bugs") sectorCssClass = "text-terminids";
                else if (owner.includes("automaton") || owner === "bots") sectorCssClass = "text-automaton";
                else if (owner.includes("illuminate") || owner === "squid") sectorCssClass = "text-illuminate";
            }

            if (owner.includes("earth") || owner === "humans") avatarGlowClass = "avatar-glow-seaf";
            else if (owner.includes("terminids") || owner === "bugs") avatarGlowClass = "avatar-glow-terminids";
            else if (owner.includes("automaton") || owner === "bots") avatarGlowClass = "avatar-glow-automaton";
            else if (owner.includes("illuminate") || owner === "squid") avatarGlowClass = "avatar-glow-illuminate";


            const biomeName = planet.biomeName || "Unknown";
            let formattedBiome = biomeName.toLowerCase().replace(/\s+/g, '_');

            html += `
                <div class="planet-list-card" onclick="openPlanetOverlay(${planet.index})"
                    data-planet-id="${planet.index}"
                    data-name="${planet.name.toLowerCase()}"
                    data-sector="${planet.sector.toLowerCase()}"
                    data-owner="${planet.owner.toLowerCase()}"
                    data-biome="${planet.biomeName.toLowerCase()}"
                    data-players="${planet.players || 0}"
                    data-defending="${planet.isUnderAttack ? '1' : '0'}">

                    <div class="planet-avatar-container ${avatarGlowClass}">
                        <img src="/static/src/images/planets/${formattedBiome}.webp" alt="${biomeName}" class="planet-avatar" onerror="this.src='/static/src/images/planets/moon.webp'">

                        <img src="/static/src/images/planets/planet_grid.gif" class="planet-grid-overlay" alt="">
                    </div>
                    <div class="planet-list-info">
                        <div class="planet-card-stat">
                            <h3 class="planet-list-title ${factionClass}">${planet.name}</h3>
                            <span class="icon-label">
                                <img src="/static/src/images/hd2-skull.png" class="icon-label" alt="">
                                <span class="helldiver-color">${planet.players}</span>
                            </span>
                        </div>
                        <p><strong>Sector:</strong> <span class="${sectorCssClass}">${planet.sector}</span></p>
                        <p><strong>Biome:</strong> ${planet.biomeName}</p>
                    </div>
                </div>
            `;
        });

        html += `</div>`;

        //for each planet node add event listeners
        contentArea.querySelectorAll('.planet-node').forEach(node => {
            node.addEventListener('click', () => {
                //grab planet ID we stored
                const planetID = node.dataset.planetID;
                const planetData = planetsArray.find(p => p.index == planetID);

                if (planetData) {
                    // Replaced alert with a non-blocking modal
                    showCustomAlert(`${planetData.name}!\nSector: ${planetData.sector}\nBiome: ${planetData.biome}`);
                }           
            });
        });

        html += `<div id="custom-alert-overlay" style="display: none;">
                    <div id="custom-alert-box">
                        <pre id="custom-alert-message"></pre>
                        <button id="custom-alert-ok">OK</button>
                    </div>
                 </div>`;
        contentArea.innerHTML += html;

        document.getElementById('custom-alert-ok').addEventListener('click', () => {
            document.getElementById('custom-alert-overlay').style.display = 'none';
        });

        function runFiltersAndSort() {
            const container = document.getElementById('planet-grid-container');
            if (!container) return;

            const allCards = Array.from(container.querySelectorAll('.planet-list-card'));

            const searchTerm =  document.getElementById('planet-search').value.toLowerCase();
            const selectedFaction = document.getElementById('faction-filter').value.toLowerCase();
            const sortBy = document.getElementById('sort-by').value;
            const sortOrder = document.getElementById('sort-order').value;

            allCards.forEach(card => {
                const { name, sector, owner, biome, players } = card.dataset;


                const matchesSearch = name.includes(searchTerm) || sector.includes(searchTerm) || biome.includes(searchTerm);

                let matchesFaction = false;
                if (selectedFaction === 'all') {
                    matchesFaction = true;
                } else if (selectedFaction === 'humans' && (owner.includes('earth') || owner.includes('humans'))) {
                    matchesFaction = true;
                } else if (owner.includes(selectedFaction)) {
                    matchesFaction = true;
                }
                
                card.style.display = (matchesSearch && matchesFaction) ? 'flex' : 'none';
            });

            const cardsArray = Array.from(allCards);

            cardsArray.sort((a, b) => {
                let valA, valB;

                if (sortBy === 'name') {
                    valA = (a.dataset.name || "").toLowerCase();
                    valB = (b.dataset.name || "").toLowerCase();
                } else if (sortBy === 'players') {
                    valA = parseInt(a.dataset.players) || 0;
                    valB = parseInt(b.dataset.players) || 0;
                } else if (sortBy === 'sectors') {
                    valA = (a.dataset.sector || "").toLowerCase();
                    valB = (b.dataset.sector || "").toLowerCase();
                } else if (sortBy === 'biomes') {
                    valA = (a.dataset.biome || "").toLowerCase();
                    valB = (b.dataset.biome || "").toLowerCase();
                } else if (sortBy === 'defending') {
                    valA = parseInt(a.dataset.defending) || 0;
                    valB = parseInt(b.dataset.defending) || 0;
                }

                if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
                if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
                return 0;
            });

            cardsArray.forEach(card => container.appendChild(card));
        }

        ['planet-search', 'faction-filter', 'sort-by', 'sort-order'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', runFiltersAndSort);
                el.addEventListener('change', runFiltersAndSort);
            }
        });
        
    } catch (error) {
        console.error('Failed to fetch planets:', error);
        contentArea.innerHTML = '<p style="color:red;">Error loading planet data.</p>';
    }
}

//renders galactic map page
async function renderGalacticMap(contentArea) {
    contentArea.innerHTML = `
        <div class="galactic-map-wrapper">
            <div id="map-container"></div>
            <div id="map-tooltip" class="galactic-map-tooltip"></div>
        </div>
    `;

    const allPlanets = await fetchPlanetData();
    const sectorPos = 
    window.planetCache = allPlanets;
    const planetsArray = Object.values(allPlanets);

    const uniqueBiomes = [...new Set(planetsArray.map(p => (p.biomeName || 'unknown').toLowerCase().replace(/\s+/g, '_')))];
    const imageCache = {};
    await Promise.all(uniqueBiomes.map(biome => new Promise(resolve => {
        const img = new Image();
        img.onload = () => { imageCache[biome] = img; resolve(); };
        img.onerror = resolve; // skip missing images gracefully
        img.src = `/static/src/images/planets/${biome}.webp`;
    })));

    const biomeCache = {};
    await Promise.all(uniqueBiomes.map(biome => new Promise(resolve => {
        const img = new Image();
        img.onload = () => { biomeCache[biome] = img; resolve(); };
        img.onerror = resolve; // skip missing images gracefully
        img.src = `/static/src/images/landscapes/${biome}.png`;
    })));

    const container = document.getElementById('map-container');
    const canvasSize = container.offsetWidth;

    const stage = new Konva.Stage({
        container: 'map-container',
        width: canvasSize,
        height: canvasSize
    });

    const sectorLayer = new Konva.Layer();
    const lineLayer = new Konva.Layer();
    const layer = new Konva.Layer();

    stage.add(sectorLayer);
    stage.add(lineLayer);
    stage.add(layer);

    // Enable drag-to-pan
    stage.draggable(true);
    stage.container().style.cursor = 'grab';

    const MIN_SCALE = 0.5;
    const MAX_SCALE = 5;

    stage.on('wheel', function(e) {
        e.evt.preventDefault();

        const scaleBy = 1.1;
        const oldScale = stage.scaleX();
        const pointer = stage.getPointerPosition();

        const mousePointTo = {
            x: (pointer.x - stage.x()) / oldScale,
            y: (pointer.y - stage.y()) / oldScale,
        };

        let newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
        newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

        stage.scale({ x: newScale, y: newScale });

        if (newScale === MIN_SCALE) {
            // Centre the map when fully zoomed out
            const offset = (canvasSize * (1 - newScale)) / 2;
            stage.position({ x: offset, y: offset });
        } else {
            stage.position({
                x: pointer.x - mousePointTo.x * newScale,
                y: pointer.y - mousePointTo.y * newScale,
            });
        }
    });

    stage.on('dragstart', function() {
        stage.container().style.cursor = 'grabbing';
        tooltip.style.display = 'none';
    });

    stage.on('dragend', function() {
        stage.container().style.cursor = 'grab';
    });

    const borderStrokeWidth = 2;
    const mapBorderCircle = new Konva.Circle({
        x: canvasSize / 2,
        y: canvasSize / 2,
        radius: canvasSize / 2 - borderStrokeWidth / 2,
        fill: 'transparent',
        stroke: '#555',
        strokeWidth: borderStrokeWidth,
    });
    layer.add(mapBorderCircle);

    const radius = canvasSize * 0.0075;
    const hoverRadius = radius * 1.75;
    const tooltip = document.getElementById('map-tooltip');

    // Handles waypoints <============>
    const planetPositions = {};
    planetsArray.forEach((planet) => {
        planetPositions[planet.index] = {
            x: toCanvasX(planet.position.x, canvasSize),
            y: toCanvasY(planet.position.y, canvasSize)
        };
    });

    planetsArray.forEach((planet) => {
        const from = planetPositions[planet.index];
        
        planet.waypoints.forEach(waypointIndex => {
            const to = planetPositions[waypointIndex];

            if (!from || !to) return;

            const line = new Konva.Line({
                points: [from.x, from.y, to.x, to.y],
                stroke: '#ffffff',
                strokeWidth: 0.5,
                opacity: 0.3,
            });

            lineLayer.add(line)
        });
    });

    planetsArray.forEach((planet) => {
        let factionColor = '';
        const ownerFaction = planet.owner.toLowerCase();
        if (ownerFaction === 'terminids') {
            factionColor = '#FF9f00';
        } else if (ownerFaction === 'automaton') {
            factionColor = '#fe6a67';
        } else if (ownerFaction === 'illuminate') {
            factionColor = '#db58fb';
        } else {
            factionColor = '#6bb7ea';
        }

        const biomeName = planet.biomeName || "Unknown";
        let formattedBiome = biomeName.toLowerCase().replace(/\s+/g, '_');

        const ownerLower = planet.owner.toLowerCase();
        let statusHtml = '';
        if (planet.isUnderAttack) {
            const defenderProgress = (1 - (planet.currentHealth / planet.maxHealth)) * 100;

            const now = Math.floor(Date.now() / 1000);
            const eventStartTimeUnix = new Date(planet.eventStartTime).getTime() / 1000;
            const eventEndTimeUnix = new Date(planet.eventEndTime).getTime() / 1000;
            const attackerProgress = Math.min(100, ((now - eventStartTimeUnix) / (eventEndTimeUnix - eventStartTimeUnix)) * 100);

            let attackerColor = factionColor; // fall back to owner's color (e.g. Helldivers attacking an enemy planet)
            if (planet.attackingFaction === 'Terminids') attackerColor = '#ff9f00';
            else if (planet.attackingFaction === 'Automaton') attackerColor = '#fe6a67';
            else if (planet.attackingFaction === 'Illuminate') attackerColor = '#db58fb';

            statusHtml = `
                <div class="progress-bar-container planet-modal-progress-bar">
                    <div class="progress-bar-text">${defenderProgress.toFixed(3)}% Super Earth progress</div>
                    <div class="progress-bar defender-bar" style="width:${defenderProgress}%;"></div>
                </div>
                <div class="progress-bar-container planet-modal-progress-bar">
                    <div class="progress-bar-text">${attackerProgress.toFixed(3)}% ${planet.attackingFaction} progress</div>
                    <div class="progress-bar attacker-bar" style="width:${attackerProgress}%; background-color:${attackerColor} !important;"></div>
                </div>`;
        } else {
            let libProgress = (planet.currentHealth / planet.maxHealth) * 100;
            if (ownerLower !== 'humans') libProgress = 100 - libProgress;
            libProgress = Math.max(0, Math.min(100, libProgress));
            if (libProgress < 100) {
                statusHtml = `
                <div class="progress-bar-container planet-modal-progress-bar">
                    <div class="progress-bar-text">${libProgress.toFixed(3)}% liberated</div>
                    <div class="progress-bar liberation-bar" style="width:${libProgress}%; background-color:${factionColor} !important;"></div>
                </div>`;
            }
        };

        const planetImg = imageCache[formattedBiome];
        const x = toCanvasX(planet.position.x, canvasSize);
        const y = toCanvasY(planet.position.y, canvasSize);

        const planetObject = new Konva.Circle({
            x, y, radius,
            ...(planetImg ? {
                fillPatternImage: planetImg,
                fillPatternOffset: { x: planetImg.width / 2, y: planetImg.height / 2 },
                fillPatternScale: { x: (radius * 2) / planetImg.width, y: (radius * 2) / planetImg.height },
            } : { fill: '#888' }), // fallback if image failed to load
            name: planet.name,
            id: planet.index,
            stroke: factionColor,
            strokeWidth: 1,
        });

        let liberationIcon = null;
        const iconSize = radius * 2;
        const hoverIconSize = iconSize * 1.5;

        //hover over
        planetObject.on('mouseenter', function() {
            stage.container().style.cursor = 'pointer';

            const landscapeImg = biomeCache[formattedBiome];
            tooltip.style.backgroundImage = landscapeImg
                ? `linear-gradient(rgba(20, 20, 20, 0.55), rgba(20, 20, 20, 0.55)), url('${landscapeImg.src}')`
                : 'none';

            tooltip.style.borderColor = factionColor;
            tooltip.innerHTML = `
                <p><strong style="color:${factionColor};">${planet.name}</strong><p>
                <p style="color:${factionColor}; font-size: 1.1em; margin: 0;">${planet.sector} Sector</p>
                <p style="margin: 3px 0 0 0; display: flex; align-items: center; justify-content: center; gap: 3px;">
                    <img src="/static/src/images/hd2-skull.png" alt="" class="icon-label"><span class="helldiver-color">${(planet.players || 0).toLocaleString()}</span>
                </p>
                ${statusHtml}
            `;

            tooltip.style.display = 'flex';

            // Position tooltip centered below planet, accounting for zoom/pan
            const stageScale = stage.scaleX();
            const stagePos = stage.position();
            const containerRect = stage.container().getBoundingClientRect();
            const gap = 8;

            const screenX = containerRect.left + (x * stageScale + stagePos.x);
            const screenY = containerRect.top + (y * stageScale + stagePos.y);

            const tooltipWidth = tooltip.offsetWidth;
            const tooltipHeight = tooltip.offsetHeight;
            const planetBottom = screenY + hoverRadius * stageScale;

            // Flip above if below would go off screen
            const flipY = planetBottom + gap + tooltipHeight > window.innerHeight;
            const top = flipY
                ? screenY - hoverRadius * stageScale - gap - tooltipHeight
                : planetBottom + gap;

            // Center horizontally, clamped to viewport
            const left = Math.max(4, Math.min(
                screenX - tooltipWidth / 2,
                window.innerWidth - tooltipWidth - 4
            ));

            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';

            this.to({
                radius: hoverRadius,
                duration: 0.15,
                onUpdate: function() {
                    if (!planetImg) return;
                    const currentRadius = planetObject.radius();
                    planetObject.fillPatternScale({
                        x: (currentRadius * 2) / planetImg.width,
                        y: (currentRadius * 2) / planetImg.height,
                    });
                }
            });
            if (liberationIcon) {
                liberationIcon.to({
                    width: hoverIconSize,
                    height: hoverIconSize,
                    x: x - hoverIconSize / 2,
                    y: y - radius - hoverIconSize - 3,
                    duration: 0.15,
                });
            }
        });
        //leave hover
        planetObject.on('mouseleave', function() {
            stage.container().style.cursor = 'grab';
            tooltip.style.display = 'none';

            this.to({
                radius: radius,
                duration: 0.15,
                onUpdate: function() {
                    if (!planetImg) return;
                    const currentRadius = planetObject.radius();
                    planetObject.fillPatternScale({
                        x: (currentRadius * 2) / planetImg.width,
                        y: (currentRadius * 2) / planetImg.height,
                    });
                }
            });
            if (liberationIcon) {
                liberationIcon.to({
                    width: iconSize,
                    height: iconSize,
                    x: x - iconSize / 2,
                    y: y - radius - iconSize - 3,
                    duration: 0.15,
                });
            }
        });

        // click/tap → open planet modal
        planetObject.on('click tap', function() {
            tooltip.style.display = 'none';
            openPlanetOverlay(planet.index);
        });

        layer.add(planetObject);

        const defenseExpired = planet.eventEndTime && new Date(planet.eventEndTime).getTime() < Date.now();

        if (!planet.isUnderAttack && planet.campaignId) {
            const iconImg = new Image();
            iconImg.onload = () => {
                liberationIcon = new Konva.Image({
                    image: iconImg,
                    x: x - iconSize / 2,
                    y: y - radius - iconSize - 3,
                    width: iconSize,
                    height: iconSize,
                    listening: false,
                });
                layer.add(liberationIcon);
                layer.batchDraw();
            };
            iconImg.src = '/static/src/images/tokens/base_liberation.png';
        } else if (planet.isUnderAttack && !defenseExpired) {
            return;            
        } 
    });

    // ── Sector regions ──────────────────────────────────────────────────────────

    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function getSectorFactionColor(faction, shadow = false) {
        if (shadow) {
            if (faction === 'terminids') return '#995f00';
            if (faction === 'automaton') return '#971410';
            if (faction === 'illuminate') return '#7d0099';
            return '#1a6090';
        }
        if (faction === 'terminids') return '#FF9f00';
        if (faction === 'automaton') return '#fe6a67';
        if (faction === 'illuminate') return '#db58fb';
        return '#6bb7ea';
    }

    // Load canonical sector→cell mapping from sectors.json
    const sectorsData = await fetch('/static-api/sector_layout.json').then(r => r.json());

    // Dominant faction per sector (by planet count)
    const sectorFactionCounts = {};
    planetsArray.forEach(planet => {
        if (!planet.sector || !planet.owner) return;
        const faction = planet.owner.toLowerCase();
        if (!sectorFactionCounts[planet.sector]) sectorFactionCounts[planet.sector] = {};
        sectorFactionCounts[planet.sector][faction] = (sectorFactionCounts[planet.sector][faction] || 0) + 1;
    });

    const sectorDominantFaction = {};
    Object.entries(sectorFactionCounts).forEach(([sector, counts]) => {
        const nonHuman = Object.entries(counts).filter(([f]) =>
            f === 'terminids' || f === 'automaton' || f === 'illuminate'
        );
        sectorDominantFaction[sector] = nonHuman.length > 0
            ? nonHuman.sort((a, b) => b[1] - a[1])[0][0]
            : 'humans';
    });

    const sectorAvailability = {};

    // Inactive sector check: all planets human-owned and all waypoints lead only to human-owned planets
    const planetOwnerByIndex = {};
    planetsArray.forEach(p => { planetOwnerByIndex[p.index] = p.owner.toLowerCase(); });

    const sectorPlanetsBySector = {};
    planetsArray.forEach(planet => {
        if (!planet.sector) return;
        if (!sectorPlanetsBySector[planet.sector]) sectorPlanetsBySector[planet.sector] = [];
        sectorPlanetsBySector[planet.sector].push(planet);
    });
    const sectorAllDisabled = {};
    Object.entries(sectorPlanetsBySector).forEach(([sector, planets]) => {
        sectorAllDisabled[sector] = planets.every(p => {
            if (p.owner.toLowerCase() !== 'humans') return false;
            return !p.waypoints || p.waypoints.every(wp => planetOwnerByIndex[wp] === 'humans');
        });
    });

    // Build cell → sector lookup for neighbour checks
    const cellToSector = {};
    Object.entries(sectorsData).forEach(([sector, cells]) => {
        cells.forEach(([gx, gy]) => {
            cellToSector[`${gx},${gy}`] = sector;
        });
    });

    const cx = canvasSize / 2;
    const cy = canvasSize / 2;
    const ringSize = (canvasSize / 2) / 10;
    const DEG = Math.PI / 180;

    let hoveredSector = null;
    const sectorAlpha = {};
    const sectorTransitions = {};
    let sectorAnimating = false;
    const TRANSITION_MS = 220;

    function easeInOut(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    function animateSectors() {
        const now = performance.now();
        let stillAnimating = false;

        Object.keys(sectorTransitions).forEach(sector => {
            const tr = sectorTransitions[sector];
            const t = Math.min(1, (now - tr.startTime) / TRANSITION_MS);
            sectorAlpha[sector] = tr.from + (tr.to - tr.from) * easeInOut(t);
            if (t < 1) stillAnimating = true;
        });

        sectorLayer.batchDraw();

        if (stillAnimating) {
            requestAnimationFrame(animateSectors);
        } else {
            sectorAnimating = false;
        }
    }

    function startTransition(sector, to) {
        const from = sectorAlpha[sector] ?? 0.2;
        sectorTransitions[sector] = { from, to, startTime: performance.now() };
        if (!sectorAnimating) {
            sectorAnimating = true;
            requestAnimationFrame(animateSectors);
        }
    }

    // Pass 1 — fill every cell with faction colour (no stroke)
    Object.entries(sectorsData).forEach(([sector, cells]) => {
        if (sector === 'Sol') return;
        const faction = sectorDominantFaction[sector] || 'humans';
        const color = getSectorFactionColor(faction, sectorAllDisabled[sector]);

        cells.forEach(([gx, gy]) => {
            const innerR    = gy * ringSize;
            const outerR    = (gy + 1) * ringSize;
            const startAngle = (gx * 15 - 90) * DEG;
            const endAngle   = ((gx + 1) * 15 - 90) * DEG;

            sectorLayer.add(new Konva.Shape({
                sceneFunc: function(context) {
                    context.beginPath();
                    if (innerR === 0) {
                        context.moveTo(cx, cy);
                        context.arc(cx, cy, outerR, startAngle, endAngle, false);
                    } else {
                        context.moveTo(cx + innerR * Math.cos(startAngle), cy + innerR * Math.sin(startAngle));
                        context.lineTo(cx + outerR * Math.cos(startAngle), cy + outerR * Math.sin(startAngle));
                        context.arc(cx, cy, outerR, startAngle, endAngle, false);
                        context.lineTo(cx + innerR * Math.cos(endAngle), cy + innerR * Math.sin(endAngle));
                        context.arc(cx, cy, innerR, endAngle, startAngle, true);
                    }
                    context.closePath();
                    context.fillStyle = hexToRgba(color, sectorAlpha[sector] ?? 0.2);
                    context.fill();
                },
            }));
        });
    });

    // Pass 2 — draw only boundary edges (skip edges shared with a same-sector neighbour)
    Object.entries(sectorsData).forEach(([sector, cells]) => {
        if (sector === 'Sol') return;
        const faction = sectorDominantFaction[sector] || 'humans';
        const strokeColor = hexToRgba(getSectorFactionColor(faction, sectorAllDisabled[sector]), 0.6);

        cells.forEach(([gx, gy]) => {
            const innerR = gy * ringSize;
            const outerR = (gy + 1) * ringSize;
            const startAngle = (gx * 15 - 90) * DEG;
            const endAngle = ((gx + 1) * 15 - 90) * DEG;

            const sameInner = gy > 0 && cellToSector[`${gx},${gy - 1}`] === sector;
            const sameOuter = cellToSector[`${gx},${gy + 1}`] === sector;
            const sameLeft = cellToSector[`${(gx - 1 + 24) % 24},${gy}`] === sector;
            const sameRight = cellToSector[`${(gx + 1) % 24},${gy}`] === sector;

            sectorLayer.add(new Konva.Shape({
                sceneFunc: function(context) {
                    context.strokeStyle = strokeColor;
                    context.lineWidth = 1;

                    // Inner arc
                    if (!sameInner && innerR > 0) {
                        context.beginPath();
                        context.arc(cx, cy, innerR, startAngle, endAngle, false);
                        context.stroke();
                    }
                    // Outer arc
                    if (!sameOuter) {
                        context.beginPath();
                        context.arc(cx, cy, outerR, startAngle, endAngle, false);
                        context.stroke();
                    }
                    // Left radial line
                    if (!sameLeft) {
                        context.beginPath();
                        context.moveTo(cx + innerR * Math.cos(startAngle), cy + innerR * Math.sin(startAngle));
                        context.lineTo(cx + outerR * Math.cos(startAngle), cy + outerR * Math.sin(startAngle));
                        context.stroke();
                    }
                    // Right radial line
                    if (!sameRight) {
                        context.beginPath();
                        context.moveTo(cx + innerR * Math.cos(endAngle), cy + innerR * Math.sin(endAngle));
                        context.lineTo(cx + outerR * Math.cos(endAngle), cy + outerR * Math.sin(endAngle));
                        context.stroke();
                    }
                },
            }));
        });
    });

    sectorLayer.draw();
    stage.on('mousemove', function() {
        const pos = stage.getPointerPosition();
        if (!pos) return;
        const stageScale = stage.scaleX();
        const stagePos = stage.position();
        const localX = (pos.x - stagePos.x) / stageScale;
        const localY = (pos.y - stagePos.y) / stageScale;

        const dx = localX - cx;
        const dy = localY - cy;
        const r = Math.sqrt(dx * dx + dy * dy);
        const gy = Math.floor(r / ringSize);
        const angleDeg = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;
        const gx = Math.floor(angleDeg / 15) % 24;

        const newHover = cellToSector[`${gx},${gy}`] || null;
        if (newHover !== hoveredSector) {
            const prev = hoveredSector;
            hoveredSector = newHover;
            if (prev) startTransition(prev, 0.2);
            if (newHover) startTransition(newHover, 0.45);
        }
    });

    stage.on('mouseleave', function() {
        if (hoveredSector !== null) {
            const prev = hoveredSector;
            hoveredSector = null;
            startTransition(prev, 0.2);
        }
    });

    layer.draw();
};

//renders armoury data page
async function renderArmoury(contentArea) {
    try {
        const response = await fetch('/static-api/armoury.json');
        if (!response.ok) throw new Error('Network error');

        
    } catch (error) {
        console.error('Failed to fetch armoury data:', error);
        contentArea.innerHTML = '<p style="color:red;">Error loading armoury data.</p>';
    }
}; 

//renders changelog
async function renderChangelog(contentArea) {
    try {
        const response = await fetch('/static-api/changelog.html');

        if (!response.ok) {
            throw new Error('Network response was not ok.');
        };

        const html_snippet = await response.text();

        contentArea.innerHTML = `
            <div id="changelog-container" style="padding: 20px;">
                ${html_snippet}
            </div>
        `;
    } catch (error) {
        console.error("Failed to intercept CHANGELOG:", error);
        contentArea.innerHTML = '<h2 style="color: red;">Error: Transmission Lost.</h2>';
    }
};


/*  
    ============================================
    UTILITY FUNCTIONS
    ============================================
*/

function formatTaskType(typeString) {
    if (!typeString) return "Unknown Type";

    return typeString.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function expirationTimeCountdown(expirationTime, elementId) {
    const displayElement = document.getElementById(elementId);
    if (!displayElement || !expirationTime) return;

    let safeTimeString = String(expirationTime).trim().replace(" ", "T");
    if (!safeTimeString.endsWith("Z") && !safeTimeString.includes("+")) {
        safeTimeString += "Z";
    }

    const targetDate = new Date(safeTimeString).getTime();

    if (isNaN(targetDate)) {
        console.error("Invalid Date String received:", expirationTime, "Parsed as:", safeTimeString);
        displayElement.innerText = "Invalid Date";
        return;
    }

    if (window.activeTimers[elementId]) {
        clearInterval(window.activeTimers[elementId]);
    }

    const updateTimer = () => {
        const now = new Date().getTime();
        const distance = targetDate - now;

        //Expired
        if (distance < 0) {
            if (window.activeTimers[elementId]) {
                clearInterval(window.activeTimers[elementId]);
                delete window.activeTimers[elementId];
            }
            displayElement.innerHTML = "<span style='color: red;'>EXPIRED</span>";
            return;
        }

        // how to pad numbers with 0's
        const pad = (num) => String(num).padStart(2, "0");

        //Handles time calculations (days, hours, etc.)
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        //updates screen with new time
        displayElement.innerText = `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
    };

    updateTimer();

    window.activeTimers[elementId] = setInterval(updateTimer, 1000);
}

async function fetchPlanetData() {
    if (cachedPlanets) return cachedPlanets;
    const response = await fetch('/static-api/planets.json');
    cachedPlanets = await response.json();
    return cachedPlanets;
}

async function fetchDispatchData() {
    if (dispatchData) return dispatchData;

    const config = await loadApiConfig();
    if (config?.newsFeedUrl) {
        try {
            const res = await fetch(config.newsFeedUrl, { headers: config.headers || {} });
            if (res.ok) {
                const raw = await res.json();
                if (Array.isArray(raw) && raw.length > 0) {
                    dispatchData = raw.map(d => {
                        const msg = d.message || '';
                        if (!msg || msg.trim().toLowerCase() === 'void msg') return null;
                        const formatted = msg
                            .replace(/<i=3>(.*?)<\/[iI]>/gs, '<span class="dispatch-header">$1</span>')
                            .replace(/<i=1>(.*?)<\/[iI]>/gs, '<span class="dispatch-highlight">$1</span>')
                            .replace(/\n/g, '<br>');
                        const pub = d.published ? new Date(d.published) : null;
                        let pubShort = 'N/A', pubFull = 'N/A';
                        if (pub) {
                            const mm = String(pub.getUTCMonth() + 1).padStart(2, '0');
                            const dd = String(pub.getUTCDate()).padStart(2, '0');
                            const yy = String(pub.getUTCFullYear()).slice(-2);
                            const hh = String(pub.getUTCHours()).padStart(2, '0');
                            const min = String(pub.getUTCMinutes()).padStart(2, '0');
                            pubShort = `${mm}-${dd}-${yy}`;
                            pubFull = `${mm}-${dd}-${yy} ${hh}:${min} UTC`;
                        }
                        return { id: d.id, type: d.type, published_short: pubShort, published_full: pubFull, message: formatted };
                    }).filter(Boolean);
                    return dispatchData;
                }
            }
        } catch (e) {
            console.warn('[Live Dispatch] Fetch failed:', e);
        }
    }

    // Fallback to static file
    const res = await fetch('/static-api/dispatches.json');
    dispatchData = res.ok ? await res.json() : [];
    return dispatchData;
}

function determinePlanetHazards(planet) {
    const hasHazards = planet.hazards && planet.hazards.length > 0;
    return hasHazards ? planet.hazards : "No hazards found on this planet.";
}

function getHazardFileName(hazardName) {
    const formattedName = hazardName.replace(/\s+/g, '_');
    return `${formattedName}.svg`;
};

async function fetchEnemiesData() {
    if (window.enemiesCache) return window.enemiesCache;
    try {
        const res = await fetch('/static-api/enemies.json');
        if (res.ok) window.enemiesCache = await res.json();
    } catch (e) {
        console.error('Failed to fetch enemies data:', e);
    }
    return window.enemiesCache;
}

function checkTaskProgressHTML(taskInput, planetData, enemiesData = null) {
    if (Array.isArray(taskInput)) {
        return taskInput.map(t => checkTaskProgressHTML(t, planetData, enemiesData)).join('');
    }

    const task = taskInput;
    const formattedType = formatTaskType(task.typeName || "");

    const isContest = formattedType.toLowerCase().includes("contest");

    let factionClass = '#6bb7ea'
        const ownerId = planetData && planetData.owner ? String(planetData.owner).trim().toLowerCase() : '';

        if (ownerId === 'terminids' || ownerId === '2') {
            factionClass = '#ff9f00';
        } else if (ownerId === 'automaton' || ownerId === '3') {
            factionClass = '#fe6a67';
        } else if (ownerId === 'illuminate' || ownerId === '4') {
            factionClass = '#db58fb';
        } else {factionClass = '#6bb7ea';}

    /* KILL ENEMIES */
    let killEnemiesTargetName = task.targetName;
    if (formattedType === 'Kill Enemies') {
        const fId = task.factionId;
        if (fId === 2)      factionClass = '#ff9f00'; // Terminid
        else if (fId === 3) factionClass = '#fe6a67'; // Automaton
        else if (fId === 4) factionClass = '#db58fb'; // Illuminate

        const eId = task.enemyId;
        if (eId && enemiesData && enemiesData.enemies) {
            const eIdStr = String(eId);
            for (const factionEnemies of Object.values(enemiesData.enemies)) {
                if (factionEnemies[eIdStr]) {
                    killEnemiesTargetName = factionEnemies[eIdStr];
                    break;
                }
            }
        } else {
            const factionNames = { 2: 'Terminids', 3: 'Automatons', 4: 'Illuminate' };
            killEnemiesTargetName = factionNames[fId] || task.targetName;
        }
    }

    /* BINARY CHECKBOXES */
    if (task.goal === 1 && !isContest) {
        const isComplete = task.progress >= task.goal;
        const statusColor = isComplete ? '#25c225' : '#777';
        const statusText = isComplete ? 'COMPLETED' : 'PENDING';
        const icon = isComplete ? '&#10004;' : '&#9634;';

        //DEBUG
        //console.log("Current Owner:", planetData.owner);
        
        

        let libProgress = 0
        
        if (planetData && planetData.maxHealth) {
            libProgress = (planetData.currentHealth / planetData.maxHealth) * 100;
            if (planetData.owner !== 1) {
                libProgress = 100 - libProgress;
            }
        }

        if (isComplete) { libProgress = 100; }

        return `
            <div class="progress-bar-container-binary" style="border: 1px solid ${statusColor};">
                <div class="task-container">
                    <div class="type-name">
                        <strong>${formattedType}:</strong><br>
                    </div>
                    <div class="target-name">
                        <span style="color: ${factionClass};">${killEnemiesTargetName}</span>
                    </div>
                    <div class="status" style="color: ${statusColor};">
                        <span style="font-size: 1.7em; vertical-align: middle;">${icon}</span> ${statusText}
                    </div>
                </div>
                <div class="progress-bar-container-mo">
                    <div class="task-progress-bar-text">${libProgress.toFixed(3)}%</div>
                    <div class="progress-bar liberation-bar" style="width: ${libProgress}%; background-color: ${factionClass} !important"></div>
                </div>
            </div>
        `;
    }

    else if (isContest) {

        const maxScale = task.goal > 1 ? task.goal : 8;

        const clampedProgress = Math.max(-maxScale, Math.min(maxScale, task.progress));

        const positionPercentage = 50 + (clampedProgress * (50 / maxScale));

        const displayProgress = task.progress > 0 ? '+' + task.progress : '' + task.progress;

        return `
            <div class="progress-bar-container-binary" style="border: 1px solid #777;">
                <div class="task-container">
                    <div class="type-name">
                        <strong>${formattedType}:</strong><br>
                    </div>
                    <div class="target-name">
                        <span style="color: ${factionClass}">${killEnemiesTargetName || 'Galactic Contest Progress'}</span>
                    </div>
                    <div class="status" style="color: #fff;"></div>
                </div>

                <div class="bidirectional-progress-container">
                    <div class="mo-arrow" style="left: ${positionPercentage}%;">
                        <div>▼</div>
                        <div class="mo-arrow-text">${displayProgress}</div>
                    </div>
                </div>
            </div>
        `
    }

    else {
        let progressPercent = 0;
        if (task.goal > 0) {
            progressPercent = ((Math.max(0, task.progress) / task.goal) * 100);
            progressPercent = Math.min(100, progressPercent).toFixed(3);
        }

        return `
            <div class="progress-bar-container-binary" style="border: 1px solid #777;">
                <div class="task-container">
                    <div class="type-name">
                        <strong>${formattedType}:</strong><br>
                    </div>
                    <div class="target-name">
                        <span style="color: ${factionClass}">${killEnemiesTargetName || 'Global Objective'}</span>
                    </div>
                    <div class="status" style="color: #fff;">
                        <div style="display:flex; flex-direction:column; align-items:center; line-height:1.2;">
                            <span>${task.progress.toLocaleString()}</span>
                            <div style="width:100%; height:1px; background:#fff; margin:2px 0;"></div>
                            <span>${task.goal.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
                <div class="progress-bar-container">
                    <div class="task-progress-bar-text">${progressPercent}%</div>
                    <div class="progress-bar liberation-bar" style="width: ${progressPercent}%; background-color: ${factionClass} !important;"></div>
                </div>
            </div>
        `;
    }
}

function analyzeSectors(planetData) {
    const sectors = {};

    planetData.forEach(planet => {
        const sectorName = planet.sector;

        if (!sectors[sectorName]) {
            sectors[sectorName] = [];
        }

        sectors[sectorName].push(planet);
    });
    
    return evaluateSectorControl(sectors);
};

function evaluateSectorControl(groupedSectors) {
    const sectorStatuses = {};

    for (const [sectorName, planetsInSector] of Object.entries(groupedSectors)) {
        const firstPlanetOwner = planetsInSector[0].owner;

        const isFullyControlled = planetsInSector.every(p => p.owner === firstPlanetOwner);

        if (isFullyControlled) {
            sectorStatuses[sectorName] = {
                state: "static",
                owner: firstPlanetOwner
            };
        } else {
            sectorStatuses[sectorName] = {
                state: "contested",
                owner: "Mixed"
            }
        }
    }
    return sectorStatuses;
};

function toCanvasX(x, canvasSize) {
    return (x + 1) / 2 * canvasSize;
};

function toCanvasY(y, canvasSize) {
    return (1 - y) / 2 * canvasSize;
};