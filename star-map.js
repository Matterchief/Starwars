// Star Wars 5.5e - Navi-Computer Star Map Engine
let selectedPlanet = null;

function renderNaviComputer() {
    const currentLocName = state.ship.location || "Coruscant";
    const locDisplay = document.getElementById('ship-location-display');
    if(locDisplay) locDisplay.innerText = currentLocName;
    
    const planetsG = document.getElementById('starmap-planets');
    if (!planetsG) return;
    
    const svgNS = "http://www.w3.org/2000/svg";
    planetsG.innerHTML = '';

    const margin = 5;
    
    planetsList.forEach(p => {
        const cx = margin + (p.x / 100) * (100 - margin * 2);
        const cy = margin + (p.y / 100) * (100 - margin * 2);
        const isCurrent = p.name === currentLocName;
        const jumps = calculateJumps(currentLocName, p.name);
        
        const g = document.createElementNS(svgNS, "g");
        g.style.cursor = "pointer";
        g.addEventListener("click", () => selectPlanetOnMap(p.name));
        
        // Glow behind planet
        const glow = document.createElementNS(svgNS, "circle");
        glow.setAttribute("cx", cx); glow.setAttribute("cy", cy);
        glow.setAttribute("r", isCurrent ? 3 : 1.5);
        glow.setAttribute("fill", isCurrent ? "rgba(99,102,241,0.3)" : "rgba(148,163,184,0.1)");
        g.appendChild(glow);
        
        // Current location pulse ring
        if (isCurrent) {
            const ring = document.createElementNS(svgNS, "circle");
            ring.setAttribute("cx", cx); ring.setAttribute("cy", cy);
            ring.setAttribute("r", 4);
            ring.setAttribute("fill", "none"); ring.setAttribute("stroke", "#818cf8");
            ring.setAttribute("stroke-width", "0.3");
            ring.setAttribute("opacity", "0.6");
            ring.innerHTML = `<animate attributeName="r" values="3;6;3" dur="3s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.6;0.1;0.6" dur="3s" repeatCount="indefinite"/>`;
            g.appendChild(ring);
        }
        
        // Planet dot
        const dot = document.createElementNS(svgNS, "circle");
        dot.setAttribute("cx", cx); dot.setAttribute("cy", cy);
        dot.setAttribute("r", isCurrent ? 1.8 : 1.2);
        const colors = { 0: "#818cf8", 1: "#6ee7b7", 2: "#fbbf24", 3: "#f87171", 4: "#ef4444" };
        dot.setAttribute("fill", isCurrent ? "#818cf8" : (colors[jumps] || "#94a3b8"));
        g.appendChild(dot);
        
        // Planet label
        const label = document.createElementNS(svgNS, "text");
        label.setAttribute("x", cx); label.setAttribute("y", cy - 2.5);
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("fill", isCurrent ? "#c7d2fe" : "#64748b");
        label.setAttribute("font-size", "2.2"); label.setAttribute("font-family", "'Share Tech Mono', monospace");
        label.textContent = p.name.length > 12 ? p.name.substring(0,10) + ".." : p.name;
        g.appendChild(label);
        
        planetsG.appendChild(g);
    });
    
    if (selectedPlanet) selectPlanetOnMap(selectedPlanet);
}

function selectPlanetOnMap(planetName) {
    selectedPlanet = planetName;
    const currentLocName = state.ship.location || "Coruscant";
    const panel = document.getElementById('starmap-info-panel');
    const route = document.getElementById('starmap-route');
    if (!panel || !route) return;

    const planet = planetsList.find(p => p.name === planetName);
    if (!planet) return;
    
    const isCurrent = planetName === currentLocName;
    const jumps = calculateJumps(currentLocName, planetName);
    const margin = 5;
    
    const curPlanet = planetsList.find(p => p.name === currentLocName);
    if (curPlanet && !isCurrent) {
        const x1 = margin + (curPlanet.x / 100) * (100 - margin * 2);
        const y1 = margin + (curPlanet.y / 100) * (100 - margin * 2);
        const x2 = margin + (planet.x / 100) * (100 - margin * 2);
        const y2 = margin + (planet.y / 100) * (100 - margin * 2);
        route.setAttribute("x1", x1); route.setAttribute("y1", y1);
        route.setAttribute("x2", x2); route.setAttribute("y2", y2);
        route.setAttribute("opacity", "0.7");
    } else {
        route.setAttribute("opacity", "0");
    }
    
    document.getElementById('starmap-info-name').innerText = planet.name;
    document.getElementById('starmap-info-desc').innerText = planet.desc;
    document.getElementById('starmap-info-coords').innerText = `X:${planet.x}  Y:${planet.y}`;
    document.getElementById('starmap-info-jumps').innerText = isCurrent ? 'DOCKED' : jumps + ' HYPER-JUMPS';
    
    const jumpBtn = document.getElementById('starmap-jump-btn');
    const dmBtn = document.getElementById('starmap-dm-btn');
    
    if (isCurrent) {
        jumpBtn.innerText = "In Orbit";
        jumpBtn.disabled = true;
        jumpBtn.className = "bg-slate-800 text-slate-500 px-4 py-2 rounded font-bold uppercase tracking-widest datapad-font text-xs opacity-50 cursor-not-allowed";
    } else {
        jumpBtn.innerText = "Plot & Jump";
        jumpBtn.disabled = false;
        jumpBtn.className = "bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded font-bold uppercase tracking-widest datapad-font transition-colors text-xs shadow-[0_0_10px_rgba(79,70,229,0.5)]";
        jumpBtn.onclick = () => jumpToPlanet(planet.name, jumps);
    }
    
    if (state.isDM && !isCurrent) {
        dmBtn.classList.remove('hidden');
        dmBtn.onclick = () => forceJumpDM(planet.name);
    } else {
        dmBtn.classList.add('hidden');
    }
    
    panel.classList.remove('hidden');
}
