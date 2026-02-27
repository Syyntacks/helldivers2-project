document.addEventListener('DOMContentLoaded', main)

function main() {
    console.log('The page is loaded. Running main.js...')

    window.activeTimers = {};
    
    siteNavigation();
    
    //loads homepage as default
    loadPageContent('#home');
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

function openPlanetOverlay(planet) {
    const overlay = document.getElementById("planet-overlay")

    document.getElementById("")

    if (overlay.classList.contains('active')) {
        overlay.classList.remove('active');
        overlay.style.display = 'none';
    } else {
        overlay.classList.add('active');
        overlay.style.display = 'block';
    }
}

function closePlanetOverlay() {

}

function updatePageTitle(route) {
    const display = document.getElementById('current-page-title');
    const currentRoute = route || window.location.hash || '#home';

    const titles = {
        '': 'Home',
        '#home': 'Home',
        '#planets': 'All Planets',
        '#major_orders': 'Major Orders',
        '#galaxy_stats': 'Galaxy Stats',
        '#galactic_map': 'Galactic Map',
        '#changelog': 'CHANGELOG',
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
        case '#planets':
            renderPlanetsPage(contentArea);
            break;
        case '#major_orders':
            renderMajorOrderPage(contentArea);
            break;
        case '#galaxy_stats':
            renderGalaxyStats(contentArea);
            break;
        case '#changelog':
            renderChangelog(contentArea);
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
        const [planetsResponse, moResponse, statsResponse] = await Promise.all([
            fetch('/api/planets'),
            fetch('/api/major_orders'),
            fetch('/api/galaxy_stats')
        ]);

        if (!planetsResponse.ok) throw new Error('Failed to fetch planets');
        if (!moResponse.ok) throw new Error("Failed to fetch major order(s)");
        if (!statsResponse.ok) throw new Error('Failed to fetch galaxy stats');

        //store collected json data
        const planetData = await planetsResponse.json();
        const moData = await moResponse.json();
        const statsData = await statsResponse.json();

        //process collected >>PLANET<< data
        const planetsArray = Object.values(planetData);

        planetsArray.sort((a,b) => b.players - a.players); //sort by most players to least
        const mostPopulatedPlanets = planetsArray.slice(0, 6);
        //console.log(`Length of collected planet list: ${mostPopulatedPlanets}`);
       

        //check if anything is in the list BEFORE accessing the first MO
        const currentMO = (Array.isArray(moData) && moData.length > 0) ? moData[0]: null;

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
        if (currentMO) {
            html += `
                <div class="homepage-card mo-card">
                    <h3 style="text-shadow: 2px 2px 2px #000;">${currentMO.orderTitle}</h3>
                    <p>${currentMO.orderBriefing}</p>
                    <div class="mo-tasks">
                        <h3 style="color: #ffe710; border-bottom: 1px solid #ffe710;">Objectives</h3>
            `;

            if (currentMO.tasks && currentMO.tasks.length > 0) {
                currentMO.tasks.forEach(task => {
                    const taskPlanet = planetData[task.targetPlanetId] || {};
                    html += checkTaskProgressHTML(task, taskPlanet);
                });
            } else {
                html += "<p>No specific tasks data available.</p>";
            }
            console.log(currentMO.orderExpires)
            html += `
                    </div>
                    <p><strong>Expires:</strong> <span id="homepage-mo-timer">${currentMO.orderExpires}</span></p>
                    <p><strong>Reward:</strong> ${currentMO.rewardsAmount} Medals</p>
                </div>
            `;
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

        mostPopulatedPlanets.forEach(planet => {
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
            if (planet.isUnderAttack) {
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
                console.log(attackingFaction)
                if (attackingFaction === 'Terminids') {factionColor = '#ff9f00';} 
                else if (attackingFaction === 'Automaton') {factionColor = '#fe6a67';} 
                else if (attackingFaction === 'Illuminate') {factionColor = '#db58fb';}


                // HANDLES PROGRESSION BARS
                healthBarHtml += `
                    <div class="progress-bar-container" style="position: relative;">
                        <div class="progress-bar-text" style="position: absolute; width: 100%; text-align: center; z-index: 10; color: white; text-shadow: 1px 1px 2px black; line-height: 1.5em;">
                            ${helldiverPercentStr}%
                        </div>
                    
                        <div class="progress-bar defender-bar" style="width: ${defenderProgress}%;"></div>
                    </div>
                    <div class="progress-bar-container" style="position: relative;">
                        <div class="progress-bar-text" style="position: absolute; width: 100%; font-size: 0.9rem; text-align: center; z-index: 10; color: white; text-shadow: 1px 1px 2px black; line-height: 1.5em;">
                            ${attackingPercentStr}%
                        </div>
                    
                        <div class="progress-bar attacker-bar" style="width: ${attackerProgress}%; background-color: ${factionColor} !important;"></div>
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
                        <div class="progress-bar-text">
                            ${liberationProgress.toFixed(3)}%
                        </div>
                        <div class="progress-bar liberation-bar" style="width: ${liberationProgress}%; background-color: ${factionClass} !important;"></div>
                    </div>
                `;
            }

            const playerPercent = ((planet.players / statsData.totalPlayers) * 100).toFixed(2);

            html += `
                <div class="stat-card ${defenseClass}" data-biome="${planet.biomeName}">
                    <h3 style="color: ${factionClass};">${planet.name}</h3>
                    <p>
                        <span class="player-count-highlight">${planet.players.toLocaleString()}</span> Helldivers (${playerPercent}%)<br>
                    </p>
                    <div class="defense-timer">
                        ${defenseTimerHtml}
                    </div>
                    <div class="health-bar">
                        ${healthBarHtml}
                    </div>
                    
                </div>`;
        });

        html += `</div>`; // closes stats-layout grid
        html += `</div>`; // closes planet homepage card

        
        //KILL STATS SUMMARY
        html += `
            <div class="homepage-card">
                <h3 style="font-weight: bold; margin-top: 16px; margin-bottom: 10px; text-shadow: 2px 2px 2px #000;">WAR EFFORT SUMMARY</h3>
                <div class="stats-summary-grid">
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
                            Helldivers Online: <span class="helldiver-color">${statsData.totalPlayers.toLocaleString()}</span><br>
                            Bullets Fired: <span class="helldiver-color">${statsData.bulletsFired.toLocaleString()}</span><br>
                            Projectile Hits: <span class="helldiver-color">${statsData.bulletsHit.toLocaleString()}</span><br>
                            Helldiver Accuracy: <span class="helldiver-color">${statsData.accuracy.toLocaleString()}%</span><br>
                            Missions Won: <span class="success-color">${statsData.missionsWon.toLocaleString()} (${statsData.missionsWonPercent.toLocaleString()}%)</span><br>
                            Missions Lost: <span class="automaton-color">${statsData.missionsLost.toLocaleString()}</span><br>
                            Missions Total: <span class="helldiver-color">${statsData.missionsTotal.toLocaleString()}</span><br>
                            Friendly Kills: <span class="automaton-color">${statsData.accidentals.toLocaleString()}<span>
                        </div>
                    </div>
                </div>
                <div>
                    
                </div>
            </div>
        `;

        contentArea.innerHTML = html;

        //MO timer
        if (currentMO && currentMO.orderExpires) {
            expirationTimeCountdown(currentMO.orderExpires, "homepage-mo-timer")
        }
        defenseTimersToStart.forEach(timer => {
            expirationTimeCountdown(timer.time, timer.id);
        })

    } catch (error) {
        console.error('Failed to load homepage:', error);
        contentArea.innerHTML = '<p style="color:red;">Error loading homepage data.</p>';
    }
}

//renders galaxy stats
async function renderGalaxyStats(contentArea) {
    //'try' and 'catch' are similar to 'try' and 'except'
    try {
        console.log('Fetching stats from /api/galaxy_stats...');
        const response = await fetch('/api/galaxy_stats');

        //check if network request was successful
        if (!response.ok) {
            throw new Error(`Network error: ${response.status}`);
            //sends error to catch block
        }

        //await to decode collected response as JSON
        const data = await response.json();
        console.log('Sucessfully fetched galaxyStats:', data);
        
        //KILLS DATA
        const bugKills = data.terminidKills || 0; // || defaults to 0 if no stats can be found.
        const botKills = data.automatonKills || 0;
        const squidKills = data.illuminateKills || 0;
        const overallKills = bugKills + botKills + squidKills;

        const missionsWon = data.missionsWon || 0;
        const missionsLost = data.missionsLost || 0;
        const missionsTotal = missionsWon + missionsLost;
        const missionsWinPercent = (missionsWon / missionsTotal) * 100;

        contentArea.innerHTML = `
            <h2>Galactic Stats Summary</h2>
            <p>Freedom's greetings, Helldiver. Check out the current summary of our stats across the galaxy.</p>
            <div class="stats-layout">
                <div class="stat-card">
                    <h3>Terminid Kills</h3>
                    <p class="terminid-color">${bugKills.toLocaleString()}</p>
                </div>
                <div class="stat-card">
                    <h3>Automaton Kills</h3>
                    <p class="automaton-color">${botKills.toLocaleString()}</p>
                </div>
                <div class="stat-card">
                    <h3>Illuminate Kills </h3>
                    <p class="illuminate-color">${squidKills.toLocaleString()}</p>
                </div>
                <div class="stat-card">
                    <h3>Total Kills</h3>
                    <p>${overallKills.toLocaleString()}</p>
                </div>
                <div class="stat-card">
                    <h3>Missions Data</h3>
                    <p>Missions Won: ${missionsWon.toLocaleString()}/${missionsTotal.toLocaleString()}</p>
                    <p>Win Percent: ${missionsWinPercent.toLocaleString()}%</p>
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
        const [moResponse, planetsResponse] = await Promise.all([
            fetch('/api/major_orders'),
            fetch('/api/planets')
        ]);
            

        //check if network request was successful
        if (!moResponse.ok) throw new Error(`Network error: ${moResponse.status}`);
        if (!planetsResponse.ok) throw new Error(`Network error: ${planetsResponse.status}`);

        //mo list
        const moData = await moResponse.json();
        const planetData = await planetsResponse.json();

        if (moData.length === 0) {
            contentArea.innerHTML = '<h2>No Active Major Orders</h2>';
            return;
        }

        let ordersHtml = '<h2>Active Major Orders</h2>';

        //mo list loop
        for (const order of moData) {
            //adds expression to original value
            //build an MO card based on # of MOs
            ordersHtml += `
                <div class="top-card">
                    <h3>${order.orderTitle}</h3>
                    <p>${order.orderBriefing}</p>
                    <p><strong>Expires:</strong> ${order.orderExpires}</p>
                    <p><strong>Reward:</strong> ${order.rewardsAmount} Medals</p>

                    <h4>Objectives</h4>
                `;

                //need to loop through # of tasks
                if (order.tasks && order.tasks.length > 0) {
                    order.tasks.forEach(task => {
                        let progressPercent = 0;

                        const formattedType = formatTaskType(task.typeName || "Unknown Type")
                        let completionLine = '';

                        /* DEFAULT FALLBACK */
                        if (task.goal > 0) {
                            progressPercent = ((task.progress / task.goal) * 100).toFixed(3);
                        }

                        if (task.targetPlanetId) {
                            const targetPlanet = planetData[task.targetPlanetId];

                            if (targetPlanet) {
                                /***
                                LIBERATION
                                ***/
                                if (formattedType === "Liberate") {
                                    let libCalc = (targetPlanet.currentHealth / targetPlanet.maxHealth) * 100;
                                    
                                    if (targetPlanet.owner !== "Humans") {
                                        libCalc = 100 - libCalc;
                                    }
                                    libCalc = Math.max (0, Math.min(100, libCalc));
                                    progressPercent = libCalc.toFixed(3);
                                }
                                /***
                                DEFENSE
                                ***/
                                else if (formattedType === "Defense") {
                                    if (targetPlanet.isUnderAttack) {
                                        let defCalc = (1 - (targetPlanet.currentHealth / targetPlanet.maxHealth) * 100);
                                        progressPercent = defCalc.toFixed(3);
                                    } else {
                                        progressPercent = (targetPlanet.owner === "Humans") ? "100.00" : "0.00";
                                    }
                                }
                            }

                        }
                        ordersHtml += `
                            <div class="task">
                                <p><strong>${formattedType}:</strong> ${task.targetName}</p>
                                <div class="progress-bar-container">
                                    <div class="progress-bar" style="width: ${progressPercent}%; background-color: #ffe710;"></div>
                                </div>
                                <p>${task.progress.toLocaleString()} / ${task.goal.toLocaleString()}</p>
                                <p><strong>Completion: ${progressPercent}%</strong></p>
                            </div>
                    `;
                });
            }

            ordersHtml += '</div>'; // close mo card
        }

        contentArea.innerHTML = ordersHtml; //loads final HTML (ordersHtml) into page


    } 
    catch (error) {
        console.error('Failed to fetch major orders:', error);
        contentArea.innerHTML = '<p style="color:red;">Error loading Major Orders.</p>';
    }
}

//renders planet data page
async function renderPlanetsPage(contentArea) {
    try{
        const response = await fetch('/api/planets');
        if (!response.ok) throw new Error('Network error');

        const allPlanets = await response.json();

        let html = `
            <h2>All Planets</h2>

            <div class="planet-controls" style="margin-bottom: 20px; display: flex; gap: 15px;">
                <input type="text" id="planet-search" placeholder="Search for a planet or sector..."
                    style="padding: 10px; flex-grow: 1; background: #222; color: #fff; border: 1px solid #ffe710; border-radius: 4px;">
                
                    <select id="faction-filter" style="padding: 10px; flex-grow: 1; background: #222; color: #fff; border: 1px solid #ffe710; border-radius: 4px;">
                        <option value="all">All Factions</option>
                        <option value="humans">- Super Earth</option>
                        <option value="terminids">- Terminids</option>
                        <option value="automaton">- Automatons</option>
                        <option value="illuminate">- Illuminate</option>
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
                <div class="planet-list-card" onclick="togglePlanetOverlay()"
                    data-planet-id="${planet.index}"
                    data-name="${planet.name.toLowerCase()}"
                    data-sector="${planet.sector.toLowerCase()}"
                    data-owner="${planet.owner.toLowerCase()}">

                    <div class="planet-avatar-container ${avatarGlowClass}">
                        <img src="/static/src/images/planets/${formattedBiome}.webp" alt="${biomeName}" class="planet-avatar" onerror="this.src='/static/src/images/planets/moon.webp'">

                        <img src="/static/src/images/planets/planet_grid.gif" class="planet-grid-overlay" alt="">
                    </div>
                    <div class="planet-list-info">
                        <div class="planet-card-stat">
                            <h3 class="planet-list-title ${factionClass}">${planet.name}</h3>
                            <span class="icon-label">
                                <img src=""
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

        // Search functions
        const searchInput = document.getElementById('planet-search');
        const factionFilter = document.getElementById('faction-filter');
        const allCards = contentArea.querySelectorAll('.planet-list-card');

        function runFilters() {
            const searchTerm = searchInput.value.toLowerCase();
            const selectedFaction = factionFilter.value.toLowerCase();

            allCards.forEach(card => {
                const cardName = card.dataset.name || "";
                const cardSector = card.dataset.sector || "";
                const cardOwner = card.dataset.owner || "";

                const matchesSearch = cardName.includes(searchTerm) || cardSector.includes(searchTerm);

                let matchesFaction = false;
                if (selectedFaction === 'all') {
                    matchesFaction = true;
                } else if (selectedFaction === 'humans' && (cardOwner.includes('earth') || cardOwner.includes('humans'))) {
                    matchesFaction = true;
                } else if (cardOwner.includes(selectedFaction)) {
                    matchesFaction = true;
                }

                if (matchesSearch && matchesFaction) {
                    card.style.display = 'flex';
                } else {
                    card.style.display = 'none';
                }
            });
        }

        searchInput.addEventListener('input', runFilters);
        factionFilter.addEventListener('change', runFilters);

    } catch (error) {
        console.error('Failed to fetch planets:', error);
        contentArea.innerHTML = '<p style="color:red;">Error loading planet data.</p>';
    }
}

async function renderChangelog(contentArea) {
    try {
        const response = await fetch('/api/changelog');

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

function checkTaskProgressHTML(taskInput, planetData) {
    if (Array.isArray(taskInput)) {
        return taskInput.map(t => checkTaskProgressHTML(t, planetData)).join('');
    }

    const task = taskInput;
    const formattedType = formatTaskType(task.typeName || "");

    const isContest = formattedType.toLowerCase().includes("contest");

    /* BINARY CHECKBOXES */
    if (task.goal === 1 && !isContest) {
        const isComplete = task.progress >= task.goal;
        const statusColor = isComplete ? '#25c225' : '#777';
        const statusText = isComplete ? 'COMPLETED' : 'PENDING';
        const icon = isComplete ? '&#10004;' : '&#9634;';

        //DEBUG
        //console.log("Current Owner:", planetData.owner);
        
        let factionClass = '#6bb7ea'
        const ownerId = planetData && planetData.owner ? String(planetData.owner).trim().toLowerCase() : '';

        if (ownerId === 'terminids' || ownerId === '2') {
            factionClass = '#ff9f00';
        } else if (ownerId === 'automaton' || ownerId === '3') {
            factionClass = '#fe6a67';
        } else if (ownerId === 'illuminate' || ownerId === '4') {
            factionClass = '#db58fb';
        } else {factionClass = '#6bb7ea';}

        let libProgress = 0
        
        if (planetData && planetData.maxHealth) {
            libProgress = (planetData.currentHealth / planetData.maxHealth) * 100;
            if (planetData.owner !== 1) {
                libProgress = 100 - libProgress;
            }
        }

        if (isComplete) {
            libProgress = 100;
        }
        

        return `
            <div class="progress-bar-container-binary" style="border: 1px solid ${statusColor};">
                <div class="task-container">
                    <div class="type-name">
                        <strong>${formattedType}:</strong><br>
                    </div>
                    <div class="target-name">
                        <span style="color: ${factionClass};">${task.targetName}</span>
                    </div>
                    <div class="status" style="color: ${statusColor};">
                        <span style="font-size: 1.7em; vertical-align: middle;">${icon}</span> ${statusText}
                    </div>
                </div>
                <div class="progress-bar-container">
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
                        <span style="color: #ffe710;">${task.targetName || 'Galactic Contest Progress'}</span>
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
                        <span style="color: #ffe710;">${task.targetName || 'Global Objective'}</span>
                    </div>
                    <div class="status" style="color: #fff;">
                        ${task.progress.toLocaleString()} / ${task.goal.toLocaleString()}
                    </div>
                </div>
                <div class="progress-bar-container">
                    <div class="task-progress-bar-text">${progressPercent}%</div>
                    <div class="progress-bar liberation-bar" style="width: ${progressPercent}%; background-color: #ffe710 !important;"></div>
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