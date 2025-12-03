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

//routes user's link interactions
function loadPageContent(route) {
    console.log(`Loading content for: ${route}`);

    //find the main content area
    const contentArea = document.querySelector('.content-area');
    if (!contentArea) return; //safety check

    contentArea.innerHTML = '<h2>Loading...</h2>';

    switch (route) {
        case '#home':
            renderHomePage(contentArea);
            break;
        case '#planets':
            renderPlanetsPage(contentArea);
            break;
        case '#major_orders':
            renderMajorOrderData(contentArea);
            break;
        case '#galaxy_stats':
            renderGalaxyStats(contentArea);
            break;
        default:
            contentArea.innerHTML = '<h2>404 - Page Not Found</h2>';
    }
}



/*  
    ============================================
    CONTENT RENDERING FUNCTIONS
    ============================================
*/

//renders homepage; we need to fetch multiple sources of data to create structure
async function renderHomePage(contentArea) {
    try {
        const [planetsResponse, moResponse, statsResponse] = await Promise.all([
            fetch('http://127.0.0.1:8000/api/planets'),
            fetch('http://127.0.0.1:8000/api/major_orders'),
            fetch('http://127.0.0.1:8000/api/galaxy_stats')
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
        let html = '<h2>Homepage Overview</h2>';

        //TOP ROW CONTAINER
        html += `<div class="top-row-container">`;

        //MO SUMMARY-- in top-row-container
        if (currentMO) {
            html += `
                <div class="homepage-card mo-card">
                    <h3>${currentMO.orderTitle}</h3>
                    <p>${currentMO.orderBriefing}</p>
                    <div class="mo-tasks>
                        <h3 style="color: #ffe710; border-bottom: 1px solid #ffe710;">Objectives</h3>
            `;

            if (currentMO.tasks && currentMO.tasks.length > 0) {
                currentMO.tasks.forEach(task => {
                    let progressPercent = 0;
                    if (task.goal > 0) {
                        progressPercent = ((task.progress / task.goal) * 100).toFixed(2);
                    }

                    const formattedType = formatTaskType(task.typeName || "Unknown Type")

                    html += `
                        <div style="margin-bottom: 15px;">
                            <p style="margin: 5px 0;"><strong>${formattedType}:</strong> ${task.targetName}</p>
                            <div class="progress-bar-container">
                                <div class="progress-bar" style="width: ${progressPercent}%; background-color: #ffe710; color: black !important; text-align: center;">
                                    <style="text-align: center;">${progressPercent}%</style>
                                </div>
                            </div>
                            <p style="margin: 5px 0; font-size: 0.9em; color: #ccc;">Progress: ${task.progress.toLocaleString()} / ${task.goal.toLocaleString()}</p>
                        </div>
                    `;
                });
            } else {
                html += `<p>No specific tasks data available.</p>`;
            }
            //debug: 
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
            <div class="homepage-card top-mo-card">
                <h3>Most Active Planets</h3>
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
                factionClass = '#41639c';
            }

            //checks for planet campaigns
            let defenseClass = '';
            let healthBarHtml = '';
            let defenseTimerHtml = '';

            if (planet.isUnderAttack) {
                defenseClass = 'is-defending';

                const timerId = `defense-timer-${planet.index}`
                defenseTimerHtml = `<p class="defense-timer" style="color: #fe6a67; font-weight: bold;">Time Left: <span id="${timerId}">Loading...</span></p>`;

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
                        <div class="progress-bar-text" style="position: absolute; width: 100%; text-align: center; z-index: 10; color: white; text-shadow: 1px 1px 2px black; line-height: 1.5em;">
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
                        <div class="progress-bar-text" style="position: absolute; width: 100%; text-align: center; z-index: 10; color: white; text-shadow: 1px 1px 2px black; line-height: 1.5em;">
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

                    ${healthBarHtml}
                </div>`;
        });

        html += `</div>`; // closes stats-layout grid
        html += `</div>`; // closes planet homepage card

        
        //KILL STATS SUMMARY
        html += `
            <div class="homepage-card">
                <h3>War Effort Summary</h3>
                <div class="stats-summary-grid">
                    <div class="stat-card war-effort">
                        <p>
                            <span style="font-size: 1.2em; font-weight: bolder; color: whitesmoke">Total Kills Summary</span><br>
                            <span class="terminid-color">${bugKills.toLocaleString()} (${bugPercent.toLocaleString()}%)</span><br>
                            <span class="automaton-color">${botKills.toLocaleString()} (${botPercent.toLocaleString()}%)</span><br>
                            <span class="illuminate-color">${squidKills.toLocaleString()} (${squidPercent.toLocaleString()}%)</span><br>
                            <span class="helldiver-color">______________</span><br>
                            <span style="color: whitesmoke;">${totalKills.toLocaleString()} total</span>
                        </p>
                    </div>
                    <div class="stat-card">
                        <p>
                            Helldivers Online: <span class="helldiver-color">${statsData.totalPlayers.toLocaleString()}</span>
                        </p>
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
        const response = await fetch('http://127.0.0.1:8000/api/galaxy_stats');

        //check if network request was successful
        if (!response.ok) {
            throw new Error(`Network error: ${response.status}`);
            //sends error to catch block
        }

        //await to decode collected response as JSON
        const data = await response.json();
        console.log('Sucessfully fetched galaxyStats:', data);
        
        //KILLS DATA
        const bugKills = data.bugKills || 0; // || defaults to 0 if no stats can be found.
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
async function renderMajorOrderData(contentArea) {
    contentArea = document.querySelector('.content-area');

    contentArea.innerHTML = '<h2>Loading Major Orders...</h2>'
    try {
        console.log('Fetching stats from /api/major_orders...');
        const response = await fetch('http://127.0.0.1:8000/api/major_orders');

        //check if network request was successful
        if (!response.ok) {
            throw new Error(`Network error: ${response.status}`);
            //sends error to catch block
        }

        //mo list
        const data = await response.json();

        if (data.length === 0) {
            contentArea.innerHTML = '<h2>No Active Major Orders</h2>';
            return;
        }

        let ordersHtml = '<h2>Active Major Orders</h2>';

        //mo list loop
        for (const order of data) {
            //adds expression to original value
            //build an MO card based on # of MOs
            ordersHtml += `
                <div class="top-card">
                <h3>${order.order_title}</h3>
                <p>${order.order_briefing}</p>
                <p><strong>Expires:</strong> ${order.order_expires}</p>
                <p><strong>Reward:</strong> ${order.rewards_amount} Medals</p>

                <h4>Objectives</h4>
            `;

            //need to loop through # of tasks
            for (const task of order.tasks) {
                const percentage = ((task.progress / task.goal) * 100).toFixed(2); //2 decimal places toFixed(2)
                
                const formattedType = formatTaskType(task.typeName || "Unknown Type")
                
                ordersHtml += `
                    <div class="task">
                        <p><strong>${formattedType}:</strong> ${task.targetName}</p>
                        <p>${task.progress.toLocaleString()} / ${task.goal.toLocaleString()}</p>
                        <p><strong>Completion: ${percentage}%</strong></p>
                    </div>
                `;
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
        const response = await fetch('http://127.0.0.1:8000/api/planets');
        if (!response.ok) throw new Error('Network error');

        const allPlanets = await response.json();

        let html = `
            <h2>All Planets (SVG View)</h2>
            <svg width="100%" viewBox="0 0 800 600" class="planet-svg-map">
        `;

        const planetsArray = Object.values(allPlanets);

        planetsArray.forEach((planet, index) => {
            const planetsPerRow = 5;
            const x = (index % planetsPerRow) * 150 + 100;
            const y = Math.floor(index / planetsPerRow) * 120 + 80;

            let factionClass = '';
            if (planet.owner === 2) {
                factionClass = 'terminid-color';
            } else if (planet.owner === 3) {
                factionClass = 'automaton-color';
            } else if (planet.owner === 4) {
                factionClass = 'illuminate-color';
            } else {
                factionClass = 'seaf-color';
            }

            html += `
                <g class="planet-node" data-planet-id="${planet.index}">
                    <circle cx="${x}" cy="${y}" r="30" stroke="white" stroke-width="1" class="planet-circle" />
                    <text x="${x}" y="${y + 45}" class="planet-label">
                        ${planet.name}
                    </text>

                    <text x="${x}" y="${y + 65}" class="planet-players">
                        ${planet.players.toLocaleString()} players
                    </text>
                </g>
            `;
        });

        html += '</svg>';

        contentArea.innerHTML = html;

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

    } catch (error) {
        console.error('Failed to fetch planets:', error);
        contentArea.innerHTML = '<p style="color:red;">Error loading planet data.</p>';
    }
}

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
                clearInterval(window.moTimer);
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