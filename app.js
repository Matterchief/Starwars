    /* =========================================================================
       STAR WARS 5.5e PLAYER DATAPAD — v12.1 (Full UI & Species Update)
       ========================================================================= */

    const STORAGE_KEY = "sw5e_datapad_v12_1";
    
    // Core Skills Map (Skill -> Stat)
    const skillList = {
        acrobatics: 'dex', animalHandling: 'wis', arcana: 'int', athletics: 'str', deception: 'cha',
        history: 'int', insight: 'wis', intimidation: 'cha', investigation: 'int', medicine: 'wis',
        nature: 'int', perception: 'wis', performance: 'cha', persuasion: 'cha', religion: 'int',
        sleightOfHand: 'dex', stealth: 'dex', survival: 'wis'
    };

    // Flavor text mapping
    const skillFlavor = { arcana: 'Force Lore', animalHandling: 'Beast Bond', religion: 'Sith/Jedi Dogma', history: 'Galactic History', medicine: 'Field Medic' };

    const cardCorners = '<div class="corner-bracket cb-tl"></div><div class="corner-bracket cb-tr"></div><div class="corner-bracket cb-bl"></div><div class="corner-bracket cb-br"></div>';

    // Initialize Firebase
    const firebaseConfig = {
      apiKey: "AIzaSyAkD3L_8xg2qGpNj" + "OLiNdkCdqD2iQrNyK4",
      authDomain: "sw-5e-99e61.firebaseapp.com",
      databaseURL: "https://sw-5e-99e61-default-rtdb.firebaseio.com",
      projectId: "sw-5e-99e61",
      storageBucket: "sw-5e-99e61.firebasestorage.app",
      messagingSenderId: "471013845785",
      appId: "1:471013845785:web:917475acf57be6c3097388",
      measurementId: "G-ZXCX6LB9Y3"
    };
    let db = null;

    // --- FIREBASE SYNC HELPER ---
    function firebaseSync(refStr, data) {
        if (!db) return;
        
        // Optional: show a small UI indicator for syncing here
        const syncIndicator = document.getElementById('sync-indicator');
        if (syncIndicator) syncIndicator.style.opacity = '1';

        db.ref(refStr).set(data).then(() => {
            if (syncIndicator) syncIndicator.style.opacity = '0';
        }).catch(err => {
            console.error(`Firebase Sync Failed for ${refStr}:`, err);
            // Optional: show error toast or notification
            if (syncIndicator) {
                syncIndicator.style.backgroundColor = 'red';
                setTimeout(() => syncIndicator.style.opacity = '0', 3000);
            }
        });
    }

    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
    } catch (e) {
        console.error("Firebase initialization failed (possibly blocked):", e);
    }

    // Party Data Cache
    let partyData = { slot1: null, slot2: null, slot3: null, slot4: null };
    let lastBroadcastTime = Date.now();
    let lastShipLogTime = Date.now();
    let logScrollInterval = null;

    let state = {
        activeSlot: "slot1",
        name: "", customTitle: "", cls: "", level: 1, alignment: 1, skin: "rebellion", scan: 30, static: 10, flicker: 5,
        favorites: { armory: [], spells: [] }, 
        inventory: [], 
        loadout: { armor: null, main: null, off: null },
        spellLevel: "All", spellMine: false, spellReady: false, armoryCat: "All", viewmode: "standard", uiscale: "md",
        beginnerMode: false,
        editMode: false,
        stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        hp: { current: 10, max: 10 },
        ac: 10, speed: 30,
        credits: 0,
        resources: [
            { name: "Hit Dice", current: 1, max: 1 },
            { name: "Force Pts", current: 0, max: 0 }
        ],
        proficiencies: { saves: [], skills: {} },
        ship: {
            hullMax: 100, hullCur: 100,
            shieldsMax: 50, shieldsCur: 50,
            speed: 800, hyperdrive: 2.0, crew: 2,
            cargo: [ "10x Ration Packs", "50L Tibanna Gas", "Spare Fusion Cell" ]
        },
        enemies: [],
        bountiesStatus: {}
    };

    function isEqual(obj1, obj2) {
        if (obj1 === obj2) return true;
        if (!obj1 || !obj2 || typeof obj1 !== 'object' || typeof obj2 !== 'object') return false;
        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);
        if (keys1.length !== keys2.length) return false;
        for (let key of keys1) {
            if (!keys2.includes(key) || !isEqual(obj1[key], obj2[key])) return false;
        }
        return true;
    }

    function syncToFirebase() {
        if (!state.activeSlot || state.activeSlot === 'slot4') return;
        const charData = {
            name: state.name || "Unknown",
            customTitle: state.customTitle || "",
            cls: state.cls || "None",
            level: state.level || 1,
            hp: state.hp,
            ac: state.ac,
            speed: state.speed,
            credits: state.credits,
            stats: state.stats,
            resources: state.resources || [],
            feats: state.feats || [],
            knownPowers: state.knownPowers || [],
            loadout: state.loadout || { armor: null, main: null, off: null }
        };
        firebaseSync('characters/' + state.activeSlot, charData);
    }

    function saveState() { 
        try { 
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); 
            syncToFirebase();
        } catch(e){} 
    }
    
    function initFirebaseListeners() {
        if (!db) return;
        try {
            db.ref('shared/enemies').on('value', snap => {
                const val = snap.val();
                if (val) state.enemies = val;
                else state.enemies = [];
                renderEnemies();
                if(state.isDM) renderDMEnemies();
            });

            db.ref('shared/ship').on('value', snap => {
                const data = snap.val();
                if (data && !isEqual(state.ship, data)) { 
                    state.ship = data; 
                    saveState(); 
                    renderShip(); 
                    renderNaviComputer();
                    if(state.isDM) renderDMVesselStatus();
                }
            });
            db.ref('shared/bounties').on('value', snap => {
                const data = snap.val();
                if (data && !isEqual(state.bountiesStatus, data)) { 
                    state.bountiesStatus = data; 
                    saveState(); 
                    renderBounties(); 
                }
            });
            db.ref('characters').on('value', snap => {
                const data = snap.val();
                if (data) {
                    partyData = data;
                    renderParty();
                    if(state.isDM) renderDMTelemetry();
                }
            });

            db.ref('shared/broadcast').on('value', snap => {
                const data = snap.val();
                if (data && data.message && data.timestamp > lastBroadcastTime) {
                    lastBroadcastTime = data.timestamp;
                    showHolonetAlert(data.message, data.alertColor || null);
                    // Play matching alert sound for ship alerts
                    if (typeof SHIP_ALERTS !== 'undefined' && data.message.includes('SHIP ALERT:')) {
                        const match = SHIP_ALERTS.find(a => data.message.includes(a.name.toUpperCase()));
                        if (match) { try { audioCtx.resume(); playAlertSound(match); } catch(e){} }
                    }
                }
            });
            db.ref('shared/shiplog').on('value', snap => {
                const data = snap.val();
                if (data && data.timestamp > lastShipLogTime) {
                    lastShipLogTime = data.timestamp;
                    showShipLog(data.text, data.mode);
                }
            });
            db.ref('shared/gamelog').limitToLast(30).on('value', snap => {
                const data = snap.val();
                const container = document.getElementById('game-log-container');
                if (!container) return;
                if (!data) {
                    container.innerHTML = `<div class="text-slate-700 text-center text-[10px] py-10 uppercase tracking-widest datapad-font">No combat data sync.</div>`;
                    return;
                }
                const logs = Object.values(data).sort((a,b) => b.timestamp - a.timestamp);
                container.innerHTML = logs.map(l => `
                    <div class="log-line-card flex justify-between items-center group hover:border-hud-soft transition-colors">
                        <div class="flex flex-col">
                            <div class="flex items-center gap-2">
                                <span class="text-[9px] font-bold text-hud uppercase tracking-widest">${l.name}</span>
                                <span class="text-[8px] text-slate-600 font-mono">${new Date(l.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                            </div>
                            <div class="text-white text-xs uppercase tracking-tight font-bold">${l.label}</div>
                        </div>
                        <div class="flex items-center gap-3">
                            <div class="flex flex-col items-end opacity-40">
                                <span class="text-[8px] uppercase">Roll</span>
                                <span class="text-[10px] font-mono">${(l.result - l.mod) || '?'}</span>
                            </div>
                            <div class="text-2xl font-mono ${l.result >= 20 ? 'text-emerald-400 glow-text-hud font-black' : l.result === 1 ? 'text-red-500' : 'text-white'}">
                                ${l.result}
                            </div>
                        </div>
                    </div>
                `).join('');
            });
            db.ref('shared/customBounties').on('value', snap => {
                const data = snap.val();
                if (data && !isEqual(state.customBounties, data)) { 
                    state.customBounties = data; 
                    saveState(); 
                    renderBounties(); 
                }
            });
        } catch(e) { console.error(e); }
    }

    function loadState() { 
        try { 
            const raw = localStorage.getItem(STORAGE_KEY); 
            if (raw) {
                const parsed = JSON.parse(raw);
                state = { ...state, ...parsed }; 
                if(!state.activeSlot) state.activeSlot = "slot1";
                if(!state.stats) state.stats = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
                if(!state.hp) state.hp = { current: 10, max: 10 };
                if(!state.proficiencies) state.proficiencies = { saves: [], skills: {} };
                if(!state.resources) state.resources = [{ name: "Hit Dice", current: 1, max: 1 }, { name: "Force Pts", current: 0, max: 0 }];
                if(typeof state.credits === 'undefined') state.credits = 0;
                if(typeof state.beginnerMode === 'undefined') state.beginnerMode = false;
                if(typeof state.customTitle === 'undefined') state.customTitle = '';
                if(!state.feats) state.feats = [];
                if(!state.inventory) state.inventory = [];
                if(!state.loadout) state.loadout = { armor: null, main: null, off: null };
                if(!state.knownPowers) state.knownPowers = [];
                if(!state.ship || typeof state.ship.shieldsCur === 'undefined') {
                    const name = state.ship && state.ship.name ? state.ship.name : "The Vanguard";
                    const type = state.ship && state.ship.type ? state.ship.type : "freighter";
                    state.ship = { name, type, hullMax: 100, hullCur: 100, shieldsMax: 50, shieldsCur: 50, speed: 800, hyperdrive: 2.0, crew: 2, cargo: [] };
                }
                if(!state.ship.stations) state.ship.stations = { helm: null, gunnery: null, engineering: null };
                if(!state.ship.location) state.ship.location = "Coruscant";
                if(!state.bountiesStatus) state.bountiesStatus = {};
            }
        } catch(e){} 
        if(state.beginnerMode) document.body.classList.add('beginner-mode');
        
        // Start syncing after load
        initFirebaseListeners();
    }
    
    function escapeHtml(s) { 
        if (s === null || s === undefined) return "";
        return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); 
    }
    function highlight(text, query) {
        if (!text) return "";
        if (!query) return escapeHtml(text);
        const escaped = escapeHtml(text);
        const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return escaped.replace(new RegExp(`(${q})`, 'ig'), '<mark class="hit">$1</mark>');
    }


    // --- RENDER: PROFILES ---
    function renderClasses() {
        const c = document.getElementById('classes-container');
        if (!c) return;
        let html = '';
        classData.forEach((it, i) => {
            html += `
                <div class="data-card p-4 clickable relative group overflow-hidden" onclick="openDetails('class', ${i})">
                    ${cardCorners}
                    <div class="flex justify-between items-start mb-3 relative z-10">
                        <div>
                            <span class="text-[8px] uppercase tracking-[0.2em] text-hud font-black block opacity-80">Tactical Archetype</span>
                            <h3 class="text-white font-black text-base display-font tracking-wide">${it.sw}</h3>
                        </div>
                    </div>
                    <div class="flex flex-wrap gap-1 relative z-10">
                        <span class="text-[9px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700 uppercase font-bold">5.5e: ${it.dnd}</span>
                    </div>
                </div>
            `;
        });
        c.innerHTML = html;
    }

    // --- RENDER: SPECIES ---
    function renderSpecies() {
        const c = document.getElementById('species-container');
        if (!c) return;
        let html = '';
        speciesData.forEach((s, i) => {
            html += `
                <div class="data-card p-4 clickable relative group overflow-hidden" onclick="openDetails('species', ${i})">
                    ${cardCorners}
                    <div class="flex justify-between items-start mb-3 relative z-10">
                        <div>
                            <span class="text-[8px] uppercase tracking-[0.2em] text-hud font-black block opacity-80">Biological Classification</span>
                            <h3 class="text-white font-black text-base display-font tracking-wide">${s.sw}</h3>
                        </div>
                    </div>
                    <div class="flex flex-wrap gap-1 relative z-10">
                        <span class="text-[9px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700 uppercase font-bold">${s.features.split(',')[0]}</span>
                        <span class="text-[9px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700 uppercase font-bold">${s.dnd} Equivalent</span>
                    </div>
                </div>
            `;
        });
        c.innerHTML = html;
    }

    function renderPlanets() {
        const c = document.getElementById('planets-container');
        if (!c) return;
        const q = (document.getElementById('search-planets') || {value:''}).value.toLowerCase();
        let html = '';
        planetData.forEach((p, i) => {
            if (p.name.toLowerCase().includes(q) || (p.env && p.env.toLowerCase().includes(q))) {
                html += `
                    <div class="data-card p-4 clickable relative group overflow-hidden" onclick="openDetails('planet', ${i})">
                        ${cardCorners}
                        <div class="flex justify-between items-start mb-3 relative z-10">
                            <div>
                                <span class="text-[8px] uppercase tracking-[0.2em] text-hud font-black block opacity-80">${p.env || 'Unknown Sector'}</span>
                                <h3 class="text-white font-black text-base display-font tracking-wide">${p.name}</h3>
                            </div>
                            <div class="w-10 h-10 rounded-full border border-hud/20 flex items-center justify-center bg-hud/5">
                                <svg class="w-6 h-6 text-hud/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            </div>
                        </div>
                        <div class="space-y-2 relative z-10">
                            <div class="flex items-center gap-2">
                                <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest w-16">Capital:</span>
                                <span class="text-[10px] text-hud font-mono">${p.capital}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest w-16">Terrain:</span>
                                <span class="text-[10px] text-slate-300">${p.terrain}</span>
                            </div>
                        </div>
                    </div>
                `;
            }
        });
        c.innerHTML = html;
    }

    // --- RENDER: ARMORY ---
    function renderArmoryFilters() {
        const c = document.getElementById('armory-filters');
        if (!c) return;
        const cats = ["All", "Favorites", ...new Set(armoryData.map(i=>i.cat))];
        c.innerHTML = cats.map(cat => {
            const active = (cat === state.armoryCat);
            const cls = cat==="Favorites" ? `chip chip-fav ${active?'active':''}` : `chip ${active?'active':''}`;
            return `<button class="${cls}" onclick="setArmoryCat('${cat}')">${cat==="Favorites" ? "★ Saved" : cat}</button>`;
        }).join('');
    }
    
    function setArmoryCat(cat) { state.armoryCat = cat; saveState(); renderArmoryFilters(); renderArmory(); }

    function renderArmory() {
        const armorySearchInput = document.getElementById('search-armory');
        const q = (armorySearchInput?.value || '').toLowerCase().trim();
        const c = document.getElementById('armory-container');
        if (!c) return;

        let items = armoryData.map((item, originalIndex) => ({ ...item, originalIndex }));

        items = items.filter(it => {
            if (state.armoryCat === "Favorites") {
                if (!state.favorites.armory.includes(it.originalIndex)) return false;
            } else if (state.armoryCat !== "All" && it.cat !== state.armoryCat) {
                return false;
            }
            if (!q) return true;
            return (it.sw + " " + (it.dnd||"") + " " + it.dmg + " " + it.desc).toLowerCase().includes(q);
        });

        if (items.length === 0) {
            c.innerHTML = `<div class="text-center p-8 text-slate-500"><p class="datapad-font uppercase tracking-widest text-xs">No matching gear found.</p></div>`;
            return;
        }

        let html = '';
        if (q || state.armoryCat === "Favorites") {
            items.forEach((it)=> html += armoryCard(it, q));
        } else {
            const cats = [...new Set(armoryData.map(i=>i.cat))];
            cats.forEach(cat => {
                const inCat = items.filter(i=>i.cat===cat);
                if (inCat.length===0) return;
                html += `<h3 class="text-hud font-bold uppercase tracking-widest text-sm mb-3 mt-6 pl-1 border-l-2 border-hud">// ${cat}</h3>`;
                inCat.forEach((it)=> html += armoryCard(it, q));
            });
        }
        c.innerHTML = html;
    }

    function armoryCard(it, q) {
        const starred = state.favorites.armory.includes(it.originalIndex);
        const dndEquiv = it.dnd ? `<span class="datapad-font text-[10px] text-hud opacity-80 mt-1 block">5.5e: ${highlight(it.dnd, q)}</span>` : `<span class="datapad-font text-[10px] text-hud opacity-80 mt-1 block">Star Wars Exclusive</span>`;
        return `
        <div class="data-card p-3 clickable relative group overflow-hidden" onclick="openDetails('armory', ${it.originalIndex})">
            ${cardCorners}
            <button class="fav-btn absolute top-2 right-2 ${starred?'active':''}" onclick="toggleFavorite(event, 'armory', ${it.originalIndex})" aria-label="Save">
                <svg width="20" height="20" fill="${starred?'currentColor':'none'}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            </button>
            <div class="relative z-10">
                <div class="mb-2">
                    <span class="text-[8px] uppercase tracking-[0.2em] text-hud font-black block opacity-80">${it.cat}</span>
                    <h3 class="text-white font-black text-sm display-font tracking-wide">${highlight(it.sw, q)}</h3>
                </div>
                <div class="mb-3">
                    ${dndEquiv}
                </div>
                <div class="text-xs font-bold mb-2 datapad-font" style="color: var(--accent);">${escapeHtml(it.dmg)}</div>
                <p class="text-[11px] text-slate-400 leading-snug card-desc line-clamp-2">${highlight(it.desc, q)}</p>
            </div>
        </div>`;
    }

    // --- RENDER: HOLOCRON ---
    function renderHolocronFilters() {
        const c = document.getElementById('holocron-filters');
        if (!c) return;
        const levels = ["All","Cantrip","1st","2nd","3rd","4th","5th"];
        const hasChar = !!(state.cls && classCodeMap[state.cls]);

        let html = '';
        if (hasChar) {
            html += `<button class="chip chip-ready ${state.spellReady?'active':''}" onclick="toggleReady()">⚡ Deployable</button>`;
            html += `<button class="chip chip-mine ${state.spellMine?'active':''}" onclick="toggleMine()">📖 Class Path</button>`;
        }
        html += `<button class="chip chip-fav ${state.spellLevel==='Favorites' && !state.spellMine && !state.spellReady ?'active':''}" onclick="setSpellLevel('Favorites')">★ Saved</button>`;
        levels.forEach(l => {
            const active = !state.spellMine && !state.spellReady && state.spellLevel === l;
            html += `<button class="chip ${active?'active':''}" onclick="setSpellLevel('${l}')">${l}</button>`;
        });
        c.innerHTML = html;
    }
    
    function setSpellLevel(l) { 
        state.spellLevel = l; 
        state.spellMine = false; 
        state.spellReady = false; 
        saveState(); renderHolocronFilters(); renderHolocron(); 
    }
    function toggleMine() { 
        state.spellMine = !state.spellMine; 
        if (state.spellMine) { state.spellLevel = "All"; state.spellReady = false; }
        saveState(); renderHolocronFilters(); renderHolocron(); 
    }
    function toggleReady() { 
        state.spellReady = !state.spellReady; 
        if (state.spellReady) { state.spellLevel = "All"; state.spellMine = false; }
        saveState(); renderHolocronFilters(); renderHolocron(); 
    }

    const lvlOrder = { "Cantrip":0, "1st":1,"2nd":2,"3rd":3,"4th":4,"5th":5 };

    function renderHolocron() {
        const holocronSearchInput = document.getElementById('search-holocron');
        const q = (holocronSearchInput?.value || '').toLowerCase().trim();
        const c = document.getElementById('holocron-container');
        if (!c) return;

        let items = spellData.map((item, originalIndex) => ({ ...item, originalIndex }));

        if ((state.spellMine || state.spellReady) && state.cls) {
            const code = classCodeMap[state.cls];
            const maxLvl = maxSpellLevel(state.cls, parseInt(state.level)||1);
            if (state.cls === "Monk" || code === null) {
                items = []; 
            } else {
                items = items.filter(s => {
                    if (!s.classes.includes(code)) return false;
                    if (state.spellReady) {
                        const sl = lvlOrder[s.lvl];
                        return sl <= maxLvl;
                    }
                    return true;
                });
            }
        } else if (state.spellLevel === "Favorites") {
            items = items.filter(s => state.favorites.spells.includes(s.originalIndex));
        } else if (state.spellLevel !== "All") {
            items = items.filter(s => s.lvl === state.spellLevel);
        }

        if (q) items = items.filter(s => (s.sw+" "+(s.dnd||"")+" "+s.desc+" "+s.lvl).toLowerCase().includes(q));

        if (items.length === 0) {
            c.innerHTML = `<div class="text-center p-8 text-slate-500"><p class="datapad-font uppercase tracking-widest text-xs">No matching powers found.</p></div>`;
            return;
        }

        let html = '';
        const grouped = (state.spellLevel === "All" || state.spellMine) && !q;
        if (grouped) {
            const byLvl = {};
            items.forEach(s => { (byLvl[s.lvl] = byLvl[s.lvl] || []).push(s); });
            Object.keys(byLvl).sort((a,b)=>lvlOrder[a]-lvlOrder[b]).forEach(lvl => {
                html += `<h3 class="text-hud font-bold uppercase tracking-widest text-sm mb-3 mt-6 pl-1 border-l-2 border-hud">// ${lvl==='Cantrip'?'Cantrips':'Level '+lvl}</h3>`;
                byLvl[lvl].forEach((s)=> html += spellCard(s, q));
            });
        } else {
            items.forEach((s)=> html += spellCard(s, q));
        }
        c.innerHTML = html;
    }

    function spellCard(s, q) {
        const starred = state.favorites.spells.includes(s.originalIndex);
        return `
        <div class="data-card p-3 clickable group relative overflow-hidden" onclick="openDetails('spell', ${s.originalIndex})">
            ${cardCorners}
            <div class="absolute top-2 right-2 flex gap-1 z-10">
                <button class="w-7 h-7 flex items-center justify-center rounded border transition-all ${state.knownPowers?.includes(s.originalIndex) ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-emerald-400'}" 
                        onclick="toggleKnownPower(event, ${s.originalIndex})" 
                        title="Learn Power">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                </button>
                <button class="w-7 h-7 flex items-center justify-center rounded border transition-all ${starred ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-indigo-400'}" 
                        onclick="toggleFavorite(event, 'spells', ${s.originalIndex})" 
                        title="Save to Holocron">
                    <svg class="w-4 h-4" fill="${starred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                </button>
            </div>
            
            <div class="relative z-10">
                <div class="mb-2">
                    <span class="text-[8px] uppercase tracking-[0.2em] text-indigo-400 font-black block opacity-80">${s.lvl === 0 ? 'Cantrip' : 'Level ' + s.lvl}</span>
                    <h3 class="text-white font-black text-sm display-font tracking-wide">${highlight(s.sw, q)}</h3>
                </div>

                ${s.dnd ? `
                <div class="mb-3 bg-slate-950/60 border border-slate-800 rounded p-2 flex items-center justify-between shadow-inner">
                    <div class="flex flex-col flex-1">
                        <span class="text-[8px] text-slate-500 uppercase font-bold mb-0.5 tracking-widest">Legacy Name</span>
                        <span class="text-hud datapad-font font-bold text-xs leading-tight">${highlight(s.dnd, q)}</span>
                    </div>
                    <div class="px-2 opacity-40"><svg class="w-3 h-3 text-hud" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg></div>
                    <div class="flex flex-col flex-1 text-right">
                        <span class="text-[8px] text-slate-500 uppercase font-bold mb-0.5 tracking-widest">Sync Outcome</span>
                        <span class="text-white font-bold text-xs leading-tight">${highlight(s.sw, q)}</span>
                    </div>
                </div>` : ''}

                <div class="flex flex-wrap gap-1 mb-3">
                    <span class="text-[8px] bg-indigo-950/40 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-900/30 font-bold uppercase">${s.range}</span>
                    <span class="text-[8px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded uppercase font-bold">${s.cast}</span>
                </div>

                <div class="flex gap-2">
                    <button onclick="event.stopPropagation(); rollDice('Force Attack: ${s.sw}', getMod('wis') + getProfBonus())" class="flex-1 bg-indigo-900/20 hover:bg-indigo-700/40 text-indigo-400 py-1.5 rounded text-[9px] uppercase font-black tracking-widest border border-indigo-500/20 transition-all">Roll Attack</button>
                    ${s.dmg ? `<button onclick="event.stopPropagation(); rollDamage('${s.sw}', '${s.dmg}', '${s.dmgType || ''}')" class="flex-1 bg-red-900/20 hover:bg-red-700/40 text-red-400 py-1.5 rounded text-[9px] uppercase font-black tracking-widest border border-red-500/20 transition-all">Roll Damage</button>` : ''}
                </div>
            </div>
        </div>`;
    }

    // --- MODALS ---
    function openDetails(type, index) {
        const modal = document.getElementById('details-modal');
        const title = document.getElementById('modal-title');
        const subtitle = document.getElementById('modal-subtitle');
        const content = document.getElementById('modal-content');
        if (!modal || !title || !subtitle || !content) return;
        
        let html = '';

        if (type === 'class') {
            const data = classData[index];
            title.innerText = data.sw; subtitle.innerText = `Base Class: ${data.dnd}`;
            html = `
                <div class="grid grid-cols-2 gap-2 mb-4">
                    <div class="bg-slate-900 border border-slate-700 p-2 rounded">
                        <span class="text-[10px] text-slate-500 uppercase block font-bold">Hit Die</span>
                        <span class="text-hud font-mono font-bold">${data.hitDie}</span>
                    </div>
                    <div class="bg-slate-900 border border-slate-700 p-2 rounded">
                        <span class="text-[10px] text-slate-500 uppercase block font-bold">Primary Ability</span>
                        <span class="text-hud font-bold text-sm">${data.primary}</span>
                    </div>
                    <div class="bg-slate-900 border border-slate-700 p-2 rounded col-span-2">
                        <span class="text-[10px] text-slate-500 uppercase block font-bold">Saving Throws</span>
                        <span class="text-white text-sm">${data.saves}</span>
                    </div>
                </div>
                <div class="text-slate-300 space-y-3 leading-relaxed border-t border-slate-800 pt-3">${data.fullDesc.replace(/\n/g, '<br>')}</div>
            `;
        } 
        else if (type === 'species') {
            const data = speciesData[index];
            title.innerText = data.sw; subtitle.innerText = `Base Species: ${data.dnd}`;
            html = `
                <div class="bg-slate-900 border border-slate-700 p-3 rounded mb-4">
                    <span class="text-[10px] text-slate-500 uppercase block font-bold border-b border-slate-700 pb-1 mb-2">Translated Mechanics</span>
                    <span class="text-hud text-sm font-bold">${data.stats}</span>
                </div>
                <div class="text-slate-300 space-y-3 leading-relaxed border-t border-slate-800 pt-3">${data.desc}</div>
            `;
        }
        else if (type === 'armory') {
            const data = armoryData[index];
            title.innerText = data.sw; subtitle.innerText = data.dnd ? `Base Item: ${data.dnd}` : `Star Wars Exclusive`;
            html = `
                <div class="grid grid-cols-2 gap-2 mb-4">
                    <div class="bg-slate-900 border border-slate-700 p-2 rounded">
                        <span class="text-[10px] text-slate-500 uppercase block font-bold">Damage / AC</span>
                        <span class="font-mono font-bold" style="color: var(--accent);">${data.dmg}</span>
                    </div>
                    <div class="bg-slate-900 border border-slate-700 p-2 rounded">
                        <span class="text-[10px] text-slate-500 uppercase block font-bold">Weight / Cost</span>
                        <span class="text-white font-mono text-sm">${data.weight} &nbsp;|&nbsp; ${data.cost}</span>
                    </div>
                    <div class="bg-slate-900 border border-slate-700 p-2 rounded col-span-2">
                        <span class="text-[10px] text-slate-500 uppercase block font-bold">Properties</span>
                        <span class="text-hud text-sm font-bold">${data.props}</span>
                    </div>
                </div>
                <div class="text-slate-300 space-y-3 leading-relaxed border-t border-slate-800 pt-3 mb-6">${data.fullDesc.replace(/\n/g, '<br>')}</div>
                <div class="flex gap-3 pt-4 border-t border-slate-800">
                    ${(state.inventory || []).includes(index) ? `
                        <button class="flex-1 bg-slate-900 border border-hud/30 text-hud opacity-50 py-3 rounded font-bold uppercase tracking-widest text-xs cursor-default">
                            Already In Inventory
                        </button>
                    ` : `
                        <button onclick="addToInventory(${index}); openDetails('armory', ${index});" class="flex-1 bg-hud/20 border border-hud/50 text-hud py-3 rounded font-bold uppercase tracking-widest text-xs hover:bg-hud/40 transition-all">
                            Acquire Gear
                        </button>
                    `}
                </div>
            `;
        }
        else if (type === 'planet') {
            const data = planetData[index];
            title.innerText = data.name; subtitle.innerText = `Planetary Dossier`;
            html = `
                <div class="grid grid-cols-2 gap-2 mb-4">
                    <div class="bg-slate-900 border border-slate-700 p-2 rounded">
                        <span class="text-[10px] text-slate-500 uppercase block font-bold">Capital City</span>
                        <span class="text-hud font-bold text-sm uppercase">${data.capital}</span>
                    </div>
                    <div class="bg-slate-900 border border-slate-700 p-2 rounded">
                        <span class="text-[10px] text-slate-500 uppercase block font-bold">Primary Terrain</span>
                        <span class="text-white font-bold text-xs uppercase">${data.terrain}</span>
                    </div>
                </div>
                <div class="mb-4">
                    <span class="text-[10px] text-slate-500 uppercase block font-bold mb-1">Environmental Scan</span>
                    <p class="text-slate-200 text-sm italic leading-relaxed">"${data.desc}"</p>
                </div>
                <div class="text-slate-300 space-y-3 leading-relaxed border-t border-slate-800 pt-3">
                    <span class="text-[10px] text-hud uppercase block font-bold mb-1">Historical Background</span>
                    ${data.background}
                </div>
            `;
        }
        else if (type === 'spell') {
            const data = spellData[index];
            title.innerText = data.sw; subtitle.innerText = data.dnd ? `Base Spell: ${data.dnd}` : `Star Wars Exclusive`;
            let classTags = data.classes.map(c => `<span class="class-tag">${c}</span>`).join(' ');
            
            const learned = (state.knownPowers || []).includes(index);
            const check = canLearnPower(data, state);
            const canLearn = check.allowed;

            html = `
                <div class="flex justify-between items-center mb-4 pb-3 border-b border-slate-800">
                    <div class="level-badge text-xs font-bold px-2 py-1 rounded datapad-font uppercase tracking-widest">${data.lvl}</div>
                    <div class="flex gap-1">${classTags}</div>
                </div>
                <div class="grid grid-cols-2 gap-2 mb-4">
                    <div class="bg-slate-900 border border-slate-700 p-2 rounded">
                        <span class="text-[10px] text-slate-500 uppercase block font-bold">Casting Time</span>
                        <span class="text-white text-sm font-bold">${data.cast}</span>
                    </div>
                    <div class="bg-slate-900 border border-slate-700 p-2 rounded">
                        <span class="text-[10px] text-slate-500 uppercase block font-bold">Range</span>
                        <span class="text-hud font-mono text-sm font-bold">${data.range}</span>
                    </div>
                    <div class="bg-slate-900 border border-slate-700 p-2 rounded">
                        <span class="text-[10px] text-slate-500 uppercase block font-bold">Duration</span>
                        <span class="text-white text-sm">${data.dur}</span>
                    </div>
                    <div class="bg-slate-900 border border-slate-700 p-2 rounded">
                        <span class="text-[10px] text-slate-500 uppercase block font-bold">Components</span>
                        <span class="text-white text-xs">${data.comp}</span>
                    </div>
                </div>
                <div class="text-slate-300 space-y-3 leading-relaxed border-t border-slate-800 pt-3 mb-6">${data.fullDesc.replace(/\n/g, '<br>')}</div>
                
                <div class="flex gap-3 pt-4 border-t border-slate-800">
                    ${learned ? `
                        <div class="flex flex-col flex-1 gap-2">
                            <button onclick="closeDetails(); rollItem(event, ${index}, 'spell')" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded font-bold uppercase tracking-widest text-xs transition-all shadow-[0_0_15px_rgba(79,70,229,0.3)]">
                                Deploy Power
                            </button>
                            ${data.type === 'Attack' ? `
                                <button onclick="rollSpellAttack('${data.sw}')" class="w-full bg-red-900/20 hover:bg-red-900/40 text-red-500 border border-red-900/30 py-2 rounded text-[10px] font-bold uppercase transition-all shadow-[0_0_10px_rgba(153,27,27,0.2)]">
                                    Roll Attack Roll
                                </button>
                            ` : ''}
                            ${data.dmg ? `
                                <button onclick="rollDamage('${data.sw}', '${data.dmg}')" class="w-full bg-amber-900/20 hover:bg-amber-900/40 text-amber-500 border border-amber-900/30 py-2 rounded text-[10px] font-bold uppercase transition-all shadow-[0_0_10px_rgba(180,83,9,0.2)]">
                                    Roll Damage (${data.dmg})
                                </button>
                            ` : ''}
                        </div>
                        <button onclick="toggleKnownPower(event, ${index}); openDetails('spell', ${index});" class="px-4 bg-slate-800 hover:bg-red-900/30 text-slate-400 hover:text-red-400 py-3 rounded font-bold uppercase tracking-widest text-[10px] transition-all border border-slate-700 hover:border-red-900/50">
                            Unlearn
                        </button>
                    ` : `
                        <button onclick="toggleKnownPower(event, ${index}); openDetails('spell', ${index});" 
                                class="flex-1 py-3 rounded font-bold uppercase tracking-widest text-xs transition-all border ${canLearn ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-600/40' : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'}"
                                ${!canLearn ? 'disabled' : ''}>
                            ${canLearn ? 'Integrate Into Dossier' : check.reason}
                        </button>
                    `}
                </div>
            `;
        }

        content.innerHTML = html;
        modal.classList.remove('hidden'); modal.classList.add('flex');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }

    function closeDetails() {
        const modal = document.getElementById('details-modal');
        if(modal) {
            modal.classList.add('opacity-0');
            setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 200);
        }
    }

    // --- QUICK ROLLS (For Actions & Requisitions) ---
    function rollItem(event, index, type) {
        event.stopPropagation(); 
        
        let mod = 0;
        let title = "";
        let noRoll = false;
        
        if (type === 'armory') {
            const item = armoryData[index];
            title = item.sw;
            const props = (item.props || '').toLowerCase();
            const isFinesse = props.includes('finesse');
            const isRanged = item.cat === 'Ranged' || props.includes('thrown');
            
            if (isRanged && !isFinesse) mod = getMod('dex');
            else if (isFinesse) mod = Math.max(getMod('str'), getMod('dex'));
            else mod = getMod('str');
            
            mod += getProfBonus();
            
        } else if (type === 'spell') {
            const spell = spellData[index];
            title = spell.sw;
            
            // Auto-consume slot
            const lvlDigit = lvlOrder[spell.lvl];
            if (lvlDigit > 0) {
                if (!consumeSlot(lvlDigit)) {
                    showHolonetAlert(`Mental Block: No Level ${lvlDigit} slots available.`, 'border-red-900 bg-red-950/50');
                    return;
                }
            }

            const cData = classData.find(c => c.dnd === state.cls);
            let castingMod = 0;
            if(cData) {
                const p = cData.primary.toLowerCase();
                if(p.includes('cha')) castingMod = getMod('cha');
                else if(p.includes('wis')) castingMod = getMod('wis');
                else if(p.includes('int')) castingMod = getMod('int');
                else castingMod = getMod('int');
            }
            const prof = getProfBonus();
            
            if (spell.type === 'Save') {
                const dc = 8 + castingMod + prof;
                title = `${spell.sw} (Save DC ${dc} ${spell.saveStat})`;
                noRoll = true;
            } else if (spell.type === 'Utility' || spell.type === 'Auto') {
                noRoll = true;
            } else {
                mod = castingMod + prof;
            }
        }

        rollDice(title, mod, noRoll);
    }

    async function rollDamage(label, dmgStr, mod = 0) {
        const hud = document.getElementById('dice-hud');
        const resEl = document.getElementById('dice-result');
        if (!hud || !resEl) return;

        document.getElementById('dice-label').innerText = `Rolling ${label} Damage`;
        document.getElementById('dice-mod').innerText = dmgStr;
        hud.classList.add('active');
        resEl.innerText = '--';

        const logRef = db.ref('shared/gamelog').push();
        logRef.set({
            name: state.name || "Unknown",
            label: `${label} Damage`, mod: dmgStr, result: '...', timestamp: Date.now()
        });

        // Parse dmgStr (e.g. "2d8+3")
        const parts = dmgStr.toLowerCase().replace(/\s/g, '').split(/[+-]/);
        const dicePart = parts[0]; 
        const [count, sides] = dicePart.split('d').map(n => parseInt(n) || 1);
        const flatBonus = dmgStr.includes('+') ? parseInt(parts[1]) : (dmgStr.includes('-') ? -parseInt(parts[1]) : 0);

        // Animation
        for(let i=0; i<10; i++) {
            let temp = 0;
            for(let j=0; j<count; j++) temp += Math.floor(Math.random() * sides) + 1;
            resEl.innerText = temp + flatBonus + mod;
            await new Promise(r => setTimeout(r, 60));
        }

        let total = 0;
        for(let j=0; j<count; j++) total += Math.floor(Math.random() * sides) + 1;
        total += flatBonus + mod;

        resEl.innerText = total;
        resEl.classList.add('glow-text-hud');
        
        logRef.update({ result: total });
        
        setTimeout(() => {
            closeDiceHUD();
            resEl.classList.remove('glow-text-hud');
        }, 4000);
    }

    async function rollDice(label, modifier, noRoll = false) {
        const hud = document.getElementById('dice-hud');
        const resEl = document.getElementById('dice-result');
        if (!hud || !resEl) return;

        if (noRoll) {
            document.getElementById('dice-label').innerText = label;
            document.getElementById('dice-mod').innerText = '--';
            resEl.innerText = 'OK';
            hud.classList.add('active');
            setTimeout(() => closeDiceHUD(), 1500);
            
            try {
                db.ref('shared/gamelog').push().set({
                    name: state.name || "Unknown",
                    label: label, mod: 0, result: 'INF', timestamp: Date.now()
                });
            } catch(e){}
            return;
        }

        document.getElementById('dice-label').innerText = `Rolling ${label}`;
        document.getElementById('dice-mod').innerText = modifier >= 0 ? `+${modifier}` : modifier;
        
        hud.classList.add('active');
        resEl.classList.remove('dice-crit', 'dice-fail', 'glow-text-hud');
        resEl.innerText = '--';

        const logRef = db.ref('shared/gamelog').push();
        logRef.set({
            name: state.name || "Unknown",
            label: label, mod: modifier, result: '...', timestamp: Date.now()
        });

        // Animation
        for(let i=0; i<12; i++) {
            resEl.innerText = Math.floor(Math.random() * 20) + 1;
            await new Promise(r => setTimeout(r, 45));
        }

        const roll = Math.floor(Math.random() * 20) + 1;
        const total = roll + modifier;
        
        if(roll === 20) resEl.classList.add('dice-crit', 'glow-text-hud');
        if(roll === 1) resEl.classList.add('dice-fail');
        
        resEl.innerText = total;
        logRef.update({ result: total });
        
        setTimeout(() => closeDiceHUD(), 2000);
    }

    function consumeSlot(lvl) {
        const maxSlots = getMaxSlots(state.level, state.cls);
        const max = maxSlots[lvl] || 0;
        if (max === 0) return true; 
        
        if(!state.spellSlots) state.spellSlots = {};
        const used = state.spellSlots[lvl] || 0;
        
        for(let i=0; i<max; i++) {
            if (!(used & (1 << i))) {
                state.spellSlots[lvl] = used | (1 << i);
                saveState();
                renderCharacterSheet();
                return true;
            }
        }
        return false;
    }

    function getMaxKnownPowers(level, cls) {
        const table = {
            "Sorcerer": { 1:2, 2:4, 3:6, 4:7, 5:9, 6:10, 7:11 },
            "Ranger": { 1:2, 2:3, 3:4, 4:5, 5:6, 6:6, 7:7 },
            "Cleric": { 1:2, 2:4, 3:6, 4:7, 5:9, 6:10, 7:11 } 
        };
        return (table[cls] && table[cls][level]) || 99;
    }

    // --- RESOURCES & LOADOUT ---
    function toggleKnownPower(event, index) {
        if (event) event.stopPropagation();
        if (!state.knownPowers) state.knownPowers = [];
        
        const spell = spellData[index];
        const idx = state.knownPowers.indexOf(index);
        
        if (idx > -1) {
            state.knownPowers.splice(idx, 1);
        } else {
            // Check limits for leveled spells (Cantrips are free)
            if (spell.lvl !== 'Cantrip') {
                const currentLeveledCount = state.knownPowers.filter(i => spellData[i].lvl !== 'Cantrip').length;
                const max = getMaxKnownPowers(parseInt(state.level)||1, state.cls);
                if (currentLeveledCount >= max) {
                    showHolonetAlert(`Memory Overflow: You can only master ${max} leveled powers. Unlearn one first.`, 'border-red-900 bg-red-950/50');
                    return;
                }
            }

            const check = canLearnPower(spell, state);
            if (!check.allowed) {
                showHolonetAlert(`Deployment Rejected: ${check.reason}`, 'border-red-900 bg-red-950/50');
                return;
            }
            state.knownPowers.push(index);
        }
        
        saveState();
        renderHolocron();
        renderLoadout();
        renderCharacterSheet();
    }

    function toggleFavorite(event, type, index) {
        if (event) event.stopPropagation(); 
        const favArray = state.favorites[type] || [];
        const idx = favArray.indexOf(index);
        if (idx > -1) { favArray.splice(idx, 1); } else { favArray.push(index); }
        saveState();
        if (type==='armory') renderArmory();
        if (type==='spells') renderHolocron();
        renderLoadout();
    }

    // --- INVENTORY & LOADOUT LOGIC ---
    function addToInventory(index) {
        if (!state.inventory) state.inventory = [];
        if (state.inventory.includes(index)) return;
        state.inventory.push(index);
        saveState();
        renderArmory();
        renderLoadout();
        showHolonetAlert("Item acquired and stored in inventory.", "border-hud bg-hud/10");
    }

    function removeFromInventory(index) {
        const idx = state.inventory.indexOf(index);
        if (idx > -1) {
            state.inventory.splice(idx, 1);
            // Also unequip if it was equipped
            if (state.loadout.armor === index) state.loadout.armor = null;
            if (state.loadout.main === index) state.loadout.main = null;
            if (state.loadout.off === index) state.loadout.off = null;
            saveState();
            renderArmory();
            renderLoadout();
            renderCharacterSheet();
        }
    }

    function equipItem(index, slot) {
        if (!state.loadout) state.loadout = { armor: null, main: null, off: null };
        const item = armoryData[index];
        if (!item) return;

        // Auto-assign slot if not provided based on category
        if (!slot) {
            if (item.cat === "Armor") slot = "armor";
            else if (state.loadout.main === null) slot = "main";
            else slot = "off";
        }

        state.loadout[slot] = index;

        // If it's armor, update AC
        if (slot === 'armor') {
            const acMatch = item.dmg.match(/\d+/);
            if (acMatch) {
                state.ac = parseInt(acMatch[0]);
            }
        }

        saveState();
        renderLoadout();
        renderCharacterSheet();
        showHolonetAlert(`${item.sw} equipped to ${slot.toUpperCase()} slot.`, "border-emerald-500 bg-emerald-950/30");
    }

    function unequipItem(slot) {
        if (!state.loadout) return;
        state.loadout[slot] = null;
        if (slot === 'armor') state.ac = 10; // Default AC
        saveState();
        renderLoadout();
        renderCharacterSheet();
    }

    function switchLoadoutTab(tab) {
        state.loadoutTab = tab;
        const tabs = ['inv', 'abi', 'fea'];
        const views = ['inventory', 'abilities', 'features'];
        
        tabs.forEach(t => {
            const btn = document.getElementById(`loadout-tab-${t}`);
            if (!btn) return;
            const isMatch = (t === 'inv' && tab === 'inventory') || (t === 'abi' && tab === 'abilities') || (t === 'fea' && tab === 'features');
            
            if (isMatch) {
                const color = t === 'inv' ? 'border-hud' : (t === 'abi' ? 'border-indigo-500' : 'border-emerald-500');
                btn.className = `flex-1 py-2 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 ${color} text-white`;
            } else {
                btn.className = `flex-1 py-2 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 border-transparent text-slate-500 hover:text-slate-300`;
            }
        });

        views.forEach(v => {
            const view = document.getElementById(`loadout-${v}-view`);
            if (view) view.classList.toggle('hidden', v !== tab);
        });

        saveState();
    }

    function renderLoadout() {
        const invContainer = document.getElementById('char-inventory-container');
        const abiContainer = document.getElementById('char-abilities-container');
        const feaContainer = document.getElementById('char-features-container');
        const invEmpty = document.getElementById('char-inventory-empty');
        const abiEmpty = document.getElementById('char-abilities-empty');
        const feaEmpty = document.getElementById('char-features-empty');
        const loadoutSlots = document.getElementById('active-loadout-slots');
        
        if (!invContainer || !abiContainer || !feaContainer) return;

        // Render Active Slots
        if (loadoutSlots) {
            const slots = ['armor', 'main', 'off'];
            const labels = { armor: 'Armor', main: 'Main', off: 'Off' };
            loadoutSlots.innerHTML = slots.map(slot => {
                const itemIdx = state.loadout[slot];
                const item = itemIdx !== null ? armoryData[itemIdx] : null;
                return `
                    <div class="bg-black/40 border border-slate-800 rounded p-1.5 flex flex-col justify-between min-h-[50px] relative group">
                        <span class="text-[7px] uppercase text-slate-500 datapad-font">${labels[slot]}</span>
                        ${item ? `
                            <span class="text-[9px] text-hud font-bold truncate leading-tight">${item.sw}</span>
                            <button onclick="unequipItem('${slot}')" class="absolute -top-1 -right-1 bg-red-900 text-white w-3 h-3 rounded-full flex items-center justify-center text-[7px] opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                        ` : `
                            <span class="text-[8px] text-slate-700 italic">Empty</span>
                        `}
                    </div>
                `;
            }).join('');
        }

        const knownSpells = state.knownPowers || [];
        const inventory = state.inventory || [];

        // Render Inventory
        if (inventory.length === 0) {
            invContainer.innerHTML = '';
            invEmpty.classList.remove('hidden');
        } else {
            invEmpty.classList.add('hidden');
            let html = '';
            inventory.forEach(index => {
                const item = armoryData[index];
                if(!item) return;
                const isEquipped = state.loadout.armor === index || state.loadout.main === index || state.loadout.off === index;
                html += `
                    <div class="data-card p-2 mb-2 border-slate-800 hover:border-hud transition-all flex justify-between items-center ${isEquipped ? 'bg-hud/5 border-hud/30' : ''}">
                        <div class="clickable flex-1" onclick="openDetails('armory', ${index})">
                            <span class="font-bold text-white text-xs leading-tight block">${item.sw}</span>
                            <span class="text-[9px] font-bold font-mono mt-0.5 block" style="color: var(--accent);">${item.dmg}</span>
                        </div>
                        <div class="flex gap-1">
                            ${!isEquipped ? `
                                <button onclick="equipItem(${index})" class="bg-hud/20 hover:bg-hud/40 text-hud border border-hud/30 px-2 py-1 rounded text-[8px] font-bold uppercase transition-all">Equip</button>
                            ` : `
                                <span class="text-[8px] text-hud/60 font-bold uppercase px-2 py-1 border border-hud/10 rounded">Equipped</span>
                            `}
                            <button onclick="rollItem(event, ${index}, 'armory')" class="quick-roll-btn">Roll</button>
                            <button onclick="removeFromInventory(${index})" class="bg-red-900/20 hover:bg-red-900/40 text-red-500 border border-red-900/30 px-2 py-1 rounded text-[8px] font-bold uppercase transition-all">Discard</button>
                        </div>
                    </div>
                `;
            });
            invContainer.innerHTML = html;
        }

        // Render Abilities
        if (knownSpells.length === 0) {
            abiContainer.innerHTML = '';
            abiEmpty.classList.remove('hidden');
        } else {
            abiEmpty.classList.add('hidden');
            let html = '';
            const maxKnown = getMaxKnownPowers(parseInt(state.level)||1, state.cls);
            const currentLeveled = knownSpells.filter(i => spellData[i].lvl !== 'Cantrip').length;
            
            html += `<div class="text-[9px] text-slate-500 uppercase tracking-widest mb-2 text-right">Matrix Bandwidth: ${currentLeveled} / ${maxKnown}</div>`;

            knownSpells.forEach(index => {
                const spell = spellData[index];
                if(!spell) return;
                html += `
                    <div class="data-card p-2 mb-2 clickable border-slate-800 hover:border-indigo-500 transition-all" onclick="openDetails('spell', ${index})">
                        <div class="flex justify-between items-center pr-2">
                            <div>
                                <span class="font-bold text-white text-xs block">${spell.sw}</span>
                                <span class="text-[9px] text-slate-500 uppercase tracking-widest block mt-0.5">${spell.lvl}</span>
                            </div>
                            <button onclick="rollItem(event, ${index}, 'spell')" class="quick-roll-btn">Cast</button>
                        </div>
                    </div>
                `;
            });
            abiContainer.innerHTML = html;
        }

        // Render Features
        const features = [];
        // Species
        const sp = crSpeciesOptions.find(s => s.sw === state.species || s.id === state.species);
        if (sp) {
            sp.traits.forEach(t => features.push({ source: 'Species', text: t }));
        }
        // Class
        const crData = state.cls === 'Ranger' ? crRangerData : (state.cls === 'Sorcerer' ? crSorcererData : (state.cls === 'Cleric' ? crClericData : null));
        if (crData) {
            for (let i = 1; i <= (parseInt(state.level) || 1); i++) {
                const lvlFeats = crData.levels[i];
                if (lvlFeats && lvlFeats.features) {
                    lvlFeats.features.forEach(f => features.push({ source: `Lvl ${i}`, text: f }));
                }
            }
        }

        if (features.length === 0) {
            feaContainer.innerHTML = '';
            feaEmpty.classList.remove('hidden');
        } else {
            feaEmpty.classList.add('hidden');
            feaContainer.innerHTML = features.map(f => `
                <div class="bg-slate-900/50 border border-slate-800 p-3 rounded hover:border-emerald-500/30 transition-all">
                    <span class="text-[9px] font-bold uppercase tracking-widest text-emerald-500 block mb-1">${f.source}</span>
                    <p class="text-xs text-slate-300 leading-relaxed">${f.text}</p>
                </div>
            `).join('');

            // Add Custom Feats
            const customHtml = (state.feats || []).map((feat, idx) => `
                <div class="bg-slate-900 border border-slate-700 p-3 rounded relative group mt-2">
                    <span class="text-[9px] font-bold uppercase tracking-widest text-indigo-400 block mb-1">Custom Feat / Specialty</span>
                    <p class="text-xs text-slate-100">${feat}</p>
                    ${state.editMode ? `<button onclick="removeFeat(${idx})" class="absolute top-2 right-2 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>` : ''}
                </div>
            `).join('');
            
            feaContainer.innerHTML += customHtml;
            
            if (state.editMode) {
                feaContainer.innerHTML += `
                    <button onclick="addFeat()" class="w-full mt-2 py-3 border-2 border-dashed border-slate-800 rounded text-slate-500 uppercase font-bold text-[10px] tracking-widest hover:border-hud-soft hover:text-hud-soft transition-all">+ Add New Feat / Specialty</button>
                `;
            }
        }
        
        // Ensure correct tab is visible
        if (state.loadoutTab) switchLoadoutTab(state.loadoutTab);
    }

    function addFeat() {
        const f = prompt("Enter Feat Name or Custom Specialty:");
        if (f) {
            if(!state.feats) state.feats = [];
            state.feats.push(f);
            saveState();
            renderCharacterSheet();
        }
    }

    function removeFeat(idx) {
        state.feats.splice(idx, 1);
        saveState();
        renderCharacterSheet();
    }

    // --- CHARACTER CREATOR WIZARD (D&D Beyond Style) ---
    let crStep = 1;
    const CR_TOTAL_STEPS = 7;
    const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
    const STAT_NAMES = ['str','dex','con','int','wis','cha'];
    const STAT_LABELS = {str:'Strength',dex:'Dexterity',con:'Constitution',int:'Intelligence',wis:'Wisdom',cha:'Charisma'};

    let crState = {
        name: '', species: '', cls: '', level: 1,
        baseStats: {str:null,dex:null,con:null,int:null,wis:null,cha:null},
        speciesBonuses: {}, fightingStyle: '', subclass: '', asi: {type:'',stat1:'',stat2:''},
        selectedSkills: [], selectedEquipment: []
    };

    const crSpeciesOptions = [
        {id:'human', dnd:'Human', sw:'Human', bonus:{choose2:true}, speed:30, traits:['Versatile: +1 to two ability scores of your choice','Extra Skill proficiency','Extra Language']},
        {id:'twilek', dnd:'Half-Elf', sw:"Twi'lek", bonus:{cha:2,choose1:true}, speed:30, traits:['+2 CHA, +1 to one other score','Darkvision 60ft','Fey Ancestry (Adv vs Charm)','Two extra skill proficiencies']},
        {id:'wookiee', dnd:'Half-Orc', sw:'Wookiee', bonus:{str:2,con:1}, speed:30, traits:['+2 STR, +1 CON','Darkvision 60ft','Savage Attacks (extra crit die)','Relentless Endurance (drop to 1 HP once)']},
        {id:'droid', dnd:'Warforged', sw:'Droid', bonus:{con:2,choose1:true}, speed:30, traits:['+2 CON, +1 to one other','Integrated Protection (+1 AC)','No need to eat, drink, or breathe','Poison resistance']},
        {id:'trandoshan', dnd:'Dragonborn', sw:'Trandoshan', bonus:{str:2,cha:1}, speed:30, traits:['+2 STR, +1 CHA','Breath Weapon (Acid/Fire)','Damage Resistance','Claws: 1d6 slashing unarmed']},
        {id:'chiss', dnd:'High Elf', sw:'Chiss', bonus:{dex:2,int:1}, speed:30, traits:['+2 DEX, +1 INT','Darkvision 60ft','Keen Senses (Perception prof)','Extra cantrip (INT-based)']},
        {id:'rodian', dnd:'Halfling', sw:'Rodian', bonus:{dex:2,cha:1}, speed:25, traits:['+2 DEX, +1 CHA','Lucky (reroll 1s on d20)','Brave (Adv vs Frightened)','Naturally Stealthy']},
        {id:'jawa', dnd:'Gnome', sw:'Jawa', bonus:{int:2,dex:1}, speed:25, traits:['+2 INT, +1 DEX','Darkvision 60ft','Scavenger: Adv to repair/identify tech','Nimble: Move through larger creature spaces','Utinni!: Investigation proficiency']},
        {id:'zabrak', dnd:'Tiefling', sw:'Zabrak', bonus:{cha:2,int:1}, speed:30, traits:['+2 CHA, +1 INT','Darkvision 60ft','Hellish Resistance (fire)','Infernal Legacy (Thaumaturgy cantrip)']}
    ];

    const crRangerData = {
        dnd: 'Ranger', sw: 'Bounty Hunter / Scout', hitDie: 'd10', primary: 'DEX & WIS',
        saves: ['str','dex'], armorProf: 'Light, Medium armor, Shields', weaponProf: 'Simple & Martial weapons',
        skillChoices: ['animalHandling','athletics','insight','investigation','nature','perception','stealth','survival'],
        numSkills: 3,
        fightingStyles: [
            {id:'archery', name:'Precision Targeting', dnd:'Archery', desc:'+2 to ranged attack rolls. Your HUD auto-corrects targeting drift.'},
            {id:'twf', name:'Dual Wielding', dnd:'Two-Weapon Fighting', desc:'Add ability modifier to off-hand damage. Twin blaster or vibroblade technique.'},
            {id:'defense', name:'Hardened Plating', dnd:'Defense', desc:'+1 AC while wearing armor. Reinforced beskar or durasteel weave.'},
            {id:'dueling', name:'Single-Weapon Mastery', dnd:'Dueling', desc:'+2 damage with one-handed weapon and no other weapon. Focused vibrorapier or blaster pistol style.'}
        ],
        subclasses: [
            {id:'hunter', name:'Apex Predator', dnd:'Hunter', desc:'Specialize in taking down single dangerous targets or hordes of weaker foes.',
             feature:{name:"Hunter's Prey", choices:[
                {id:'colossus', name:'Colossus Slayer', desc:'Once per turn, deal extra 1d8 damage to a creature below its max HP.'},
                {id:'giant', name:'Giant Killer', desc:'When a Large+ creature attacks you, use reaction to attack it.'},
                {id:'horde', name:'Horde Breaker', desc:'Once per turn, make an additional attack against a different creature within 5ft of your original target.'}
             ]}},
            {id:'gloom', name:'Shadow Operative', dnd:'Gloom Stalker', desc:'Strike from the darkness. You are invisible to creatures relying on darkvision.',
             feature:{name:"Dread Ambusher", desc:'On the first turn of combat, your speed increases by 10ft. If you take the Attack action, you make one additional weapon attack that deals an extra 1d8 damage.'}},
            {id:'beast', name:'Creature Handler', dnd:'Beast Master', desc:'Form a bond with a loyal creature companion that fights alongside you.',
             feature:{name:"Primal Companion", desc:'You gain a beast companion (Beast of the Land, Sea, or Sky). It obeys your commands and acts on your initiative.'}}
        ],
        levels: {
            1: {features:['Favored Enemy (Bounty Target Lock): Free cast of Hunter\'s Mark, no concentration at low levels.','Deft Explorer (Canny): Gain expertise in one skill you\'re proficient in.','2 powers known.']},
            2: {features:['Spellcasting: Access to Ranger spell list (WIS-based). 3 powers known.','Fighting Style: Choose a combat specialization.']},
            3: {features:['Ranger Conclave: Choose your subclass archetype.','4 powers known.']},
            4: {features:['Ability Score Improvement: +2 to one score OR +1 to two scores.','5 powers known.']},
            5: {features:['Extra Attack: Attack twice per Attack action.','6 powers known. 2nd-level spell slots.']},
            6: {features:['Roving: Your speed increases by 5 feet, and you gain a climbing and swimming speed.','Favored Enemy (Bounty Target Lock) Improvement: Damage increases.']},
            7: {features:['Subclass Feature: Gain an archetype ability (e.g. Defensive Tactics for Hunter).','7 powers known.']}
        }
    };

    const crEquipmentChoices = {
        Ranger: [
            {group:'Armor', options:[{id:'scale', name:'Durasteel Scale Mail (AC 14+DEX max 2)'},{id:'leather', name:'Nerf-Hide Jacket (Leather, AC 11+DEX)'}]},
            {group:'Melee Weapon', options:[{id:'vibro', name:'Vibrosword (1d8 Slashing)'},{id:'saber', name:'Training Lightsaber (1d8 Radiant)'},{id:'2short', name:'Two Vibro-shivs (Shortswords)'}]},
            {group:'Ranged Weapon', options:[{id:'carbine', name:'Blaster Carbine (1d8 Energy)'},{id:'pistol', name:'Heavy Blaster Pistol (1d6 Energy)'}]},
            {group:'Pack', options:[{id:'dungeon', name:'Infiltration Kit (Dungeoneer\'s Pack)'},{id:'explorer', name:'Expedition Kit (Explorer\'s Pack)'}]}
        ],
        Sorcerer: [
            {group:'Uniform', options:[{id:'robes', name:'Force-Thread Robes (AC 10+DEX)'},{id:'padded', name:'Reinforced Under-armor (AC 11+DEX, Disadv. Stealth)'}]},
            {group:'Weapon', options:[{id:'crossbow', name:'Hold-out Blaster & 20 bolts (Light Crossbow, 1d8 Energy)'},{id:'simple', name:'Vibro-dagger (Dagger, 1d4 Piercing)'}]},
            {group:'Force Focus', options:[{id:'pouch', name:'Utility Belt (Component Pouch) — pockets of crystals, herbs, and reagents'},{id:'focus', name:'Holocron Shard (Arcane Focus) — a fragment of an ancient Force artifact'}]},
            {group:'Pack', options:[{id:'dungeon', name:'Infiltration Kit (Dungeoneer\'s Pack)'},{id:'explorer', name:'Expedition Kit (Explorer\'s Pack)'}]}
        ],
        Cleric: [
            {group:'Armor', options:[{id:'scale', name:'Durasteel Scale Mail (AC 14+DEX max 2)'},{id:'chain', name:'Armored Flight Suit (Chain Shirt, AC 13+DEX max 2)'}]},
            {group:'Weapon', options:[{id:'mace', name:'Shock Baton (Mace, 1d6 Bludgeon)'},{id:'quarterstaff', name:'Electrostaff (Quarterstaff, 1d8 Bludgeon)'}]},
            {group:'Shield', options:[{id:'shield', name:'Energy Shield (+2 AC)'},{id:'none', name:'No Shield'}]},
            {group:'Pack', options:[{id:'priest', name:'Mystic Field Kit (Priest\'s Pack)'},{id:'explorer', name:'Expedition Kit (Explorer\'s Pack)'}]}
        ]
    };

    const crClericData = {
        dnd: 'Cleric', sw: 'Force Mystic / Consular', hitDie: 'd8', primary: 'WIS',
        saves: ['wis', 'cha'], armorProf: 'Light, Medium armor, Shields', weaponProf: 'Simple weapons',
        skillChoices: ['history','insight','medicine','persuasion','religion'],
        numSkills: 2,
        subclasses: [
            {id:'life', name:'Path of the Sage', dnd:'Life Domain', desc:'You are a master of the living Force, focusing on healing and preservation.',
             feature:{name:"Disciple of Life", desc:'Whenever you use a Force power of 1st level or higher to restore hit points, the target regains additional HP equal to 2 + the power\'s level.'}},
            {id:'light', name:'Path of the Seer', dnd:'Light Domain', desc:'You channel the pure radiance of the Light Side, banishing darkness and exposing threats.',
             feature:{name:"Warding Flare", desc:'When you are attacked by a creature within 30 feet that you can see, you can use your reaction to impose disadvantage on the attack roll.'}}
        ],
        levels: {
            1: {features:['Force Sensitivity (Spellcasting): You channel the Force through wisdom and empathy (WIS). 3 cantrips known. 2 powers known.','Divine Domain (Mystic Path): Choose your focus — Sage or Seer.']},
            2: {features:['Force Channeling (Channel Divinity): Twice per short rest, you can unleash a powerful burst of Force energy.','Harness Force Energy: Regain an expended 1st-level power slot as an action.','4 powers known.']},
            3: {features:['2nd-level Force powers unlocked. 6 powers known.','Aura of Vitality / Aid.']},
            4: {features:['Ability Score Improvement: +2 to one score OR +1 to two scores.','4th cantrip known. 7 powers known.']},
            5: {features:['3rd-level Force powers unlocked (Force Sever, Revivify). 9 powers known.','Destroy Droids (Destroy Undead): When you use Force Channeling (Turn Droids), you can destroy droids of CR 1/2 or lower.']},
            6: {features:['Force Channeling (3/rest). 10 powers known.','Subclass Feature: Gain an archetype ability.']},
            7: {features:['4th-level Force powers unlocked (Force Stasis, Banishment). 11 powers known.']}
        }
    };

    const crSorcererData = {
        dnd: 'Sorcerer', sw: 'Force Adept / Sith Inquisitor', hitDie: 'd6', primary: 'CHA',
        saves: ['con', 'cha'], armorProf: 'None', weaponProf: 'Vibro-daggers, Throwing Knives, Hold-out Blasters, Quarterstaffs',
        skillChoices: ['arcana','deception','insight','intimidation','persuasion','religion'],
        numSkills: 2,
        metamagicOptions: [
            {id:'twin', name:'Twinned Force Power', dnd:'Twinned Spell', desc:'Spend sorcery points equal to the power\'s level to target a second creature with the same Force power. Force Choke two targets at once. (Cantrips cost 1 point.)'},
            {id:'subtle', name:'Hidden Manifestation', dnd:'Subtle Spell', desc:'Spend 1 sorcery point to use a Force power without any visible gestures or words. Perform Mind Tricks without waving your hand or speaking.'},
            {id:'quicken', name:'Accelerated Casting', dnd:'Quickened Spell', desc:'Spend 2 sorcery points to change the casting time of a Force power from 1 action to 1 bonus action. Strike with blinding speed.'},
            {id:'heighten', name:'Overwhelming Will', dnd:'Heightened Spell', desc:'Spend 3 sorcery points to impose disadvantage on a target\'s first saving throw against your Force power. Crush their mental resistance.'}
        ],
        subclasses: [
            {id:'wild', name:'Unbound Force', dnd:'Wild Magic', desc:'Your connection to the Force is raw, chaotic, and unpredictable — surging through you in wild, uncontrollable bursts of power.',
             feature:{name:"Wild Force Surge (Wild Magic Surge)", desc:'After casting a Force power of 1st level or higher, roll a d20. On a 1, roll on the Wild Force Surge table — causing a random, unpredictable Force phenomenon such as spontaneous levitation or a burst of spectral fire.'}},
            {id:'shadow', name:'Dark Lineage', dnd:'Shadow Magic', desc:'Your power flows from a bloodline touched by the Dark Side — through Sith alchemy, Nightsister rituals, or ancient Sith corruption passed through generations.',
             feature:{name:"Force Darkness (Strength of the Grave)", desc:'When damage reduces you to 0 HP, make a CHA save (DC 5 + damage taken). On a success, drop to 1 HP instead. Dark Side energy refuses to let you fall. Doesn\'t work against radiant damage or critical hits.'}},
            {id:'storm', name:'Storm Conduit', dnd:'Storm Sorcery', desc:'You channel the Force through raw elemental fury — commanding lightning, kinetic shockwaves, and tempest winds.',
             feature:{name:"Tempest Aura (Tempestuous Magic)", desc:'Immediately after casting a Force power of 1st level or higher, use a bonus action to fly 10 feet without provoking opportunity attacks — propelled by a burst of Force-generated wind and kinetic energy.'}}
        ],
        levels: {
            1: {features:['Innate Force Connection (Spellcasting): Your raw, instinctive link to the Force lets you channel powers through sheer willpower (CHA). 4 cantrips known, 2 powers known.','Sorcerous Origin: Choose how your Force power manifests — Wild, Dark, or Storm.']},
            2: {features:['Sorcery Points: 2 pts (Font of Magic). Convert between sorcery points and power slots, representing your raw Force stamina.','4 powers known.']},
            3: {features:['Metamagic (Force Manipulation): Choose 2 options. Bend the rules of your Force powers — twin them, hide them, accelerate them.','6 powers known. 2nd-level power slots.']},
            4: {features:['Ability Score Improvement: +2 to one score OR +1 to two scores.','5 cantrips known. 7 powers known.']},
            5: {features:['3rd-level Force powers unlocked (Sith Lightning, Force Storm).','5 sorcery points. 9 powers known.']},
            6: {features:['Sorcerous Origin Feature: Your lineage deepens, granting a powerful new Dark Side, Wild, or Storm ability.','10 powers known.']},
            7: {features:['4th-level Force powers unlocked (Plasma Barrier, Force Exile).','7 sorcery points. 11 powers known.']}
        }
    };

    function getActiveClassData() {
        if (crState.cls === 'Sorcerer') return crSorcererData;
        if (crState.cls === 'Cleric') return crClericData;
        return crRangerData;
    }
    function getActiveEquipment() {
        return crEquipmentChoices[crState.cls] || crEquipmentChoices.Ranger;
    }

    function getCrStatTotal(stat) {
        const base = crState.baseStats[stat] || 10;
        const bonus = crState.speciesBonuses[stat] || 0;
        return base + bonus;
    }

    function crSelectSpecies(id) {
        crState.species = id;
        crState.speciesBonuses = {};
        const sp = crSpeciesOptions.find(s=>s.id === id);
        if (sp && sp.bonus) {
            Object.keys(sp.bonus).forEach(k => {
                if (k !== 'choose2' && k !== 'choose1') {
                    crState.speciesBonuses[k] = sp.bonus[k];
                }
            });
        }
        renderCreatorWizard();
    }

    function crToggleBonus(stat, limit) {
        const sp = crSpeciesOptions.find(s => s.id === crState.species);
        if (!sp) return;
        const staticStats = Object.keys(sp.bonus).filter(k => k !== 'choose1' && k !== 'choose2');
        
        let flexActive = 0;
        for (let s in crState.speciesBonuses) {
            if (!staticStats.includes(s)) flexActive++;
        }

        if (crState.speciesBonuses[stat]) {
            if (!staticStats.includes(stat)) delete crState.speciesBonuses[stat];
        } else {
            if (flexActive < limit) {
                crState.speciesBonuses[stat] = 1;
            }
        }
        renderCreatorWizard();
    }
    
    function openCreator() {
        try {
            crStep = 1;
            crState = {
                name: state.name || '', 
                species: 'human', 
                cls: '', 
                level: Math.min(parseInt(state.level) || 1, 7),
                baseStats: {str:10,dex:10,con:10,int:10,wis:10,cha:10},
                speciesBonuses: {}, 
                fightingStyle: '', 
                subclass: '', 
                metamagic: [],
                asi: {type:'',stat1:'',stat2:''},
                selectedSkills: [], 
                selectedEquipment: [], 
                profSaves: []
            };
            const modal = document.getElementById('creator-modal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
                // Force visibility and z-index
                modal.style.opacity = '1';
                modal.style.zIndex = '1000';
                setTimeout(() => modal.classList.remove('opacity-0'), 10);
                renderCreatorWizard();
            }
        } catch (err) {
            console.error("Failed to open creator:", err);
            alert("System Error: Unable to initialize Dossier Wizard.");
        }
    }

    function closeCreator() {
        const modal = document.getElementById('creator-modal');
        if(modal) {
            modal.classList.add('opacity-0');
            setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 300);
        }
    }

    function crWizardNav(dir) {
        if (dir === 1) {
            if (crStep === 1 && !crState.species) { alert("Please select a species."); return; }
            if (crStep === 2 && !crState.cls) { alert("Please select a class."); return; }
            if (crStep === 5) {
                const classData = getActiveClassData();
                const limit = classData.numSkills + (crState.species === 'human' ? 1 : crState.species === 'twilek' ? 2 : 0);
                if (crState.selectedSkills.length !== limit) { alert(`Please select exactly ${limit} skills.`); return; }
            }
        }
        crStep += dir;
        if (crStep < 1) crStep = 1;
        if (crStep > 7) crStep = 7;
        renderCreatorWizard();
    }

    function renderCreatorWizard() {
        try {
            const content = document.getElementById('cr-wizard-content');
            if (!content) return;
            
            const stepNames = ["Species", "Class", "Ability Scores", "Features & Specialization", "Proficiencies", "Equipment", "Review"];
            const labelEl = document.getElementById('cr-step-label');
            if (labelEl) labelEl.innerText = `Step ${crStep} of 7: ${stepNames[crStep-1] || 'Unknown'}`;
            
            for(let i=1; i<=7; i++) {
                const prog = document.getElementById(`cr-prog-${i}`);
                if(prog) {
                    if (i < crStep) prog.className = "cr-progress-seg flex-1 h-1.5 rounded-full bg-emerald-500 transition-all duration-300 shadow-[0_0_8px_rgba(16,185,129,0.5)]";
                    else if (i === crStep) prog.className = "cr-progress-seg flex-1 h-1.5 rounded-full bg-indigo-500 transition-all duration-300 shadow-[0_0_8px_rgba(99,102,241,0.5)]";
                    else prog.className = "cr-progress-seg flex-1 h-1.5 rounded-full bg-slate-700 transition-all duration-300";
                }
            }

            const prevBtn = document.getElementById('cr-btn-prev');
            const nextBtn = document.getElementById('cr-btn-next');
            const finishBtn = document.getElementById('cr-btn-finish');
            if (prevBtn) prevBtn.classList.toggle('hidden', crStep === 1);
            if (nextBtn) nextBtn.classList.toggle('hidden', crStep === 7);
            if (finishBtn) finishBtn.classList.toggle('hidden', crStep !== 7);

            let html = '';

            if (crStep === 1) { // SPECIES
                html += `<h3 class="text-white font-bold text-xl mb-4 display-font">Select Your Origin</h3><div class="grid gap-3">`;
                crSpeciesOptions.forEach(sp => {
                    const active = crState.species === sp.id ? 'border-emerald-500 bg-emerald-900/20' : 'border-slate-700 bg-slate-900/50 hover:border-slate-500';
                    html += `
                    <div class="border rounded p-3 cursor-pointer transition-colors ${active}" onclick="crSelectSpecies('${sp.id}')">
                        <div class="flex justify-between items-center mb-2">
                            <span class="font-bold text-lg text-white display-font">${sp.sw}</span>
                            <span class="text-[10px] uppercase text-slate-500 datapad-font tracking-widest">${sp.dnd} Equivalent</span>
                        </div>
                        <p class="text-sm text-slate-400 mb-2">${sp.traits.join(' • ')}</p>
                    </div>`;
                });
                html += `</div>`;
            }
            else if (crStep === 2) { // CLASS
                html += `<h3 class="text-white font-bold text-xl mb-4 display-font">Choose Your Profession</h3>`;
                html += `<p class="text-slate-400 text-sm mb-4">Select a class archetype. Each one maps to a D&D 5.5e base class with Star Wars flavor.</p>`;
                
                const classOptions = [
                    {key:'Ranger', data: crRangerData},
                    {key:'Sorcerer', data: crSorcererData},
                    {key:'Cleric', data: crClericData}
                ];
                
                html += `<div class="grid gap-3 mb-4">`;
                classOptions.forEach(opt => {
                    const active = crState.cls === opt.key ? 'border-emerald-500 bg-emerald-900/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'border-slate-700 bg-slate-900/50 hover:border-slate-500';
                    html += `
                    <div class="border rounded p-4 cursor-pointer transition-all ${active}" onclick="crState.cls='${opt.key}'; crState.fightingStyle=''; crState.subclass=''; crState.metamagic=[]; crState.selectedSkills=[]; crState.selectedEquipment=[]; renderCreatorWizard();">
                        <div class="flex justify-between items-center mb-2">
                            <span class="font-bold text-lg text-white display-font">${opt.data.sw}</span>
                            <span class="text-[10px] uppercase text-slate-500 datapad-font tracking-widest border border-slate-700 px-2 py-0.5 rounded">Base: ${opt.data.dnd}</span>
                        </div>
                        <div class="grid grid-cols-3 gap-2 mb-2">
                            <div class="bg-slate-950 p-2 rounded border border-slate-800"><span class="text-[10px] text-slate-500 uppercase block font-bold">Hit Die</span><span class="text-emerald-400 font-mono">${opt.data.hitDie}</span></div>
                            <div class="bg-slate-950 p-2 rounded border border-slate-800"><span class="text-[10px] text-slate-500 uppercase block font-bold">Primary</span><span class="text-white text-sm">${opt.data.primary}</span></div>
                            <div class="bg-slate-950 p-2 rounded border border-slate-800"><span class="text-[10px] text-slate-500 uppercase block font-bold">Saves</span><span class="text-white text-xs uppercase">${opt.data.saves.join(', ')}</span></div>
                        </div>
                        <div class="bg-slate-950 p-2 rounded border border-slate-800">
                            <span class="text-[10px] text-slate-500 uppercase block font-bold">Proficiencies</span>
                            <span class="text-white text-xs">${opt.data.armorProf ? opt.data.armorProf + '<br>' : ''}${opt.data.weaponProf}</span>
                        </div>
                    </div>`;
                });
                html += `</div>`;
                
                html += `
                <div class="mb-4">
                    <label class="text-[10px] text-slate-500 uppercase block font-bold mb-1">Starting Level (1-7)</label>
                    <input type="number" min="1" max="7" value="${crState.level}" onchange="crState.level = Math.min(parseInt(this.value)||1, 7); renderCreatorWizard();" class="w-full bg-slate-900 border border-slate-700 text-white rounded p-2 text-lg font-mono text-center">
                </div>
                `;
            }
            else if (crStep === 3) { // STATS
                html += `<h3 class="text-white font-bold text-xl mb-4 display-font">Determine Ability Scores</h3>`;
                html += `<p class="text-slate-400 text-sm mb-4">Standard Array applied. Modify as needed based on your species bonuses.</p>`;
                
                const sp = crSpeciesOptions.find(s=>s.id===crState.species);
                let bonusStr = "None";
                if(sp) {
                    if(sp.bonus.choose2) bonusStr = "+1 to any two scores";
                    else if(sp.bonus.choose1) {
                        const k = Object.keys(sp.bonus).filter(k=>k!=='choose1')[0];
                        bonusStr = `+2 ${k.toUpperCase()}, +1 to any other`;
                    } else {
                        bonusStr = Object.keys(sp.bonus).map(k=>`+${sp.bonus[k]} ${k.toUpperCase()}`).join(', ');
                    }
                }
                html += `<div class="bg-indigo-900/20 border border-indigo-900 p-3 rounded mb-4"><span class="text-indigo-400 text-xs font-bold uppercase tracking-widest block mb-1">Species Bonuses</span><span class="text-white text-sm">${bonusStr}</span></div>`;

                html += `<div class="grid grid-cols-2 gap-3 mb-4">`;
                ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(stat => {
                    const base = crState.baseStats[stat];
                    const bonus = crState.speciesBonuses[stat] || 0;
                    const total = base + bonus;
                    html += `
                    <div class="bg-slate-900 border border-slate-700 rounded p-3 flex flex-col gap-1">
                        <div class="flex justify-between items-center">
                            <span class="text-white font-bold uppercase tracking-widest text-[10px]">${stat}</span>
                            <span class="text-emerald-400 font-mono text-xl">${total}</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <input type="number" value="${base}" onchange="crState.baseStats['${stat}'] = parseInt(this.value)||10; renderCreatorWizard();" class="w-12 bg-slate-950 border border-slate-800 text-white rounded p-1 text-xs font-mono text-center">
                            <span class="text-[9px] text-slate-500 uppercase">Base</span>
                            ${bonus > 0 ? `<span class="text-[9px] text-emerald-500 font-bold ml-auto">+${bonus} Species</span>` : ''}
                        </div>
                    </div>`;
                });
                html += `</div>`;

                if (sp && (sp.bonus.choose1 || sp.bonus.choose2)) {
                    const count = sp.bonus.choose2 ? 2 : 1;
                    html += `
                    <div class="bg-slate-900/80 border border-slate-800 rounded p-4 mb-4">
                        <h4 class="text-white text-xs font-bold uppercase tracking-widest mb-3">Choose ${count} Extra Species Bonus${count>1?'es':''}</h4>
                        <div class="flex flex-wrap gap-2">
                    `;
                    ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(stat => {
                        const isStatic = sp.bonus[stat];
                        if (isStatic) return;

                        const isSelected = crState.speciesBonuses[stat] === 1;
                        const active = isSelected ? 'bg-emerald-600 text-white border-emerald-400' : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-600';
                        html += `<button onclick="crToggleBonus('${stat}', ${count})" class="px-3 py-1 border rounded text-[10px] uppercase font-bold transition-all ${active}">${stat}</button>`;
                    });
                    html += `</div></div>`;
                }

                html += `
                <div class="flex gap-2 mb-4">
                    <button onclick="crWizardApplyArray()" class="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-[10px] uppercase font-bold p-2 rounded border border-slate-600">Standard Array</button>
                    <button onclick="crState.baseStats={str:10,dex:10,con:10,int:10,wis:10,cha:10}; crState.speciesBonuses={}; renderCreatorWizard();" class="flex-1 bg-slate-900 hover:bg-slate-800 text-slate-400 text-[10px] uppercase font-bold p-2 rounded border border-slate-800">Reset</button>
                </div>
                `;
            }
            else if (crStep === 4) { // FEATURES & SUBCLASS
                const cd = getActiveClassData();
                html += `<h3 class="text-white font-bold text-xl mb-4 display-font">Features & Specialization</h3>`;
                html += `<p class="text-slate-500 text-[10px] uppercase tracking-widest mb-4 datapad-font">${cd.sw} <span class="text-slate-600">|</span> Base: ${cd.dnd}</p>`;
                
                // RANGER: Fighting Style (level 2+)
                if(crState.cls === 'Ranger' && crState.level >= 2 && cd.fightingStyles) {
                    html += `<div class="mb-5"><h4 class="text-indigo-400 font-bold uppercase text-xs tracking-widest mb-2 border-b border-indigo-900/50 pb-1">Combat Specialization <span class="text-slate-600 font-normal">(Fighting Style)</span></h4><div class="grid gap-2">`;
                    cd.fightingStyles.forEach(fs => {
                        const active = crState.fightingStyle === fs.id ? 'border-emerald-500 bg-emerald-900/20' : 'border-slate-700 bg-slate-900/50 hover:border-slate-500';
                        html += `<div class="border rounded p-2 cursor-pointer transition-colors ${active}" onclick="crState.fightingStyle='${fs.id}'; renderCreatorWizard();">
                            <div class="flex justify-between items-center"><span class="font-bold text-sm text-white">${fs.name}</span><span class="text-[9px] text-slate-500 uppercase datapad-font">${fs.dnd}</span></div>
                            <span class="text-xs text-slate-400 block mt-1">${fs.desc}</span>
                        </div>`;
                    });
                    html += `</div></div>`;
                }

                // SORCERER: Metamagic (level 3+)
                if(crState.cls === 'Sorcerer' && crState.level >= 3 && cd.metamagicOptions) {
                    html += `<div class="mb-5"><h4 class="text-indigo-400 font-bold uppercase text-xs tracking-widest mb-2 border-b border-indigo-900/50 pb-1">Force Manipulation <span class="text-slate-600 font-normal">(Metamagic — choose 2)</span></h4><div class="grid gap-2">`;
                    cd.metamagicOptions.forEach(mm => {
                        const isSelected = crState.metamagic.includes(mm.id);
                        const active = isSelected ? 'border-emerald-500 bg-emerald-900/20' : 'border-slate-700 bg-slate-900/50 hover:border-slate-500';
                        html += `<div class="border rounded p-2 cursor-pointer transition-colors ${active}" onclick="crWizardToggleMetamagic('${mm.id}')">
                            <div class="flex justify-between items-center"><span class="font-bold text-sm text-white">${mm.name}</span><span class="text-[9px] text-slate-500 uppercase datapad-font">${mm.dnd}</span></div>
                            <span class="text-xs text-slate-400 block mt-1">${mm.desc}</span>
                        </div>`;
                    });
                    html += `</div></div>`;
                }

                // Subclass (level 1 for Sorc, level 3 for Ranger)
                const subclassLevel = crState.cls === 'Sorcerer' ? 1 : 3;
                if(crState.level >= subclassLevel && cd.subclasses) {
                    const subLabel = crState.cls === 'Sorcerer' ? 'Sorcerous Origin' : 'Ranger Conclave';
                    html += `<div class="mb-5"><h4 class="text-indigo-400 font-bold uppercase text-xs tracking-widest mb-2 border-b border-indigo-900/50 pb-1">${subLabel} <span class="text-slate-600 font-normal">(Subclass)</span></h4><div class="grid gap-2">`;
                    cd.subclasses.forEach(sub => {
                        const active = crState.subclass === sub.id ? 'border-emerald-500 bg-emerald-900/20' : 'border-slate-700 bg-slate-900/50 hover:border-slate-500';
                        html += `<div class="border rounded p-2 cursor-pointer transition-colors ${active}" onclick="crState.subclass='${sub.id}'; renderCreatorWizard();">
                            <div class="flex justify-between items-center"><span class="font-bold text-sm text-white">${sub.name}</span><span class="text-[9px] text-slate-500 uppercase datapad-font">${sub.dnd}</span></div>
                            <span class="text-xs text-slate-400 block mt-1">${sub.desc}</span>
                            ${sub.feature ? `<div class="mt-2 bg-slate-950/80 border border-slate-800 rounded p-2"><span class="text-[9px] text-emerald-500 uppercase font-bold block mb-1">${sub.feature.name}</span><span class="text-[11px] text-slate-400">${sub.feature.desc || (sub.feature.choices ? sub.feature.choices.map(c => '<strong>' + c.name + '</strong>: ' + c.desc).join('<br>') : '')}</span></div>` : ''}
                        </div>`;
                    });
                    html += `</div></div>`;
                }

                html += `<h4 class="text-indigo-400 font-bold uppercase text-xs tracking-widest mb-2 border-b border-indigo-900/50 pb-1">Class Features Gained</h4>`;
                html += `<div class="bg-slate-900/50 p-3 rounded border border-slate-800 space-y-2">`;
                for(let i=1; i<=crState.level; i++) {
                    const levelData = cd.levels[i];
                    if(levelData && levelData.features) {
                        html += `<div class="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mt-2 first:mt-0">Level ${i}</div>`;
                        levelData.features.forEach(f => {
                            html += `<div class="text-xs text-slate-300 flex items-start gap-2"><span class="text-emerald-500 mt-0.5">•</span> <span>${f}</span></div>`;
                        });
                    }
                }
                html += `</div>`;
            }
            else if (crStep === 5) { // PROFICIENCIES
                const cd = getActiveClassData();
                let extra = 0;
                if(crState.species === 'human') extra = 1;
                if(crState.species === 'twilek') extra = 2;
                const totalSkills = cd.numSkills + extra;
                
                html += `<h3 class="text-white font-bold text-xl mb-4 display-font">Proficiencies</h3>`;
                html += `<p class="text-slate-400 text-sm mb-4">Choose exactly <strong class="text-emerald-400">${totalSkills}</strong> skills to become proficient in.</p>`;
                
                html += `<div class="grid grid-cols-2 gap-2 mb-4">`;
                cd.skillChoices.forEach(sk => {
                    const isSelected = crState.selectedSkills.includes(sk);
                    const active = isSelected ? 'border-emerald-500 bg-emerald-900/20 text-emerald-400' : 'border-slate-700 bg-slate-900/50 hover:border-slate-500 text-slate-300';
                    const dndName = sk.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                    const swName = skillFlavor && skillFlavor[sk] ? `<span class="block text-[9px] mt-0.5 opacity-70">${skillFlavor[sk]}</span>` : '';
                    html += `<div class="border rounded p-2 text-sm font-bold cursor-pointer transition-colors text-center datapad-font ${active}" onclick="crWizardToggleSkill('${sk}')">${dndName}${swName}</div>`;
                });
                html += `</div>`;
            }
            else if (crStep === 6) { // EQUIPMENT
                html += `<h3 class="text-white font-bold text-xl mb-4 display-font">Starting Equipment</h3>`;
                
                const equipList = getActiveEquipment();
                equipList.forEach((group, index) => {
                    html += `<div class="mb-4"><h4 class="text-indigo-400 font-bold uppercase text-xs tracking-widest mb-2 border-b border-indigo-900/50 pb-1">${group.group}</h4><div class="grid gap-2">`;
                    group.options.forEach(opt => {
                        const isSelected = crState.selectedEquipment[index] === opt.id;
                        const active = isSelected ? 'border-emerald-500 bg-emerald-900/20' : 'border-slate-700 bg-slate-900/50 hover:border-slate-500';
                        html += `<div class="border rounded p-2 cursor-pointer transition-colors ${active}" onclick="crState.selectedEquipment[${index}]='${opt.id}'; renderCreatorWizard();">
                            <span class="font-bold text-sm text-white block">${opt.name}</span>
                        </div>`;
                    });
                    html += `</div></div>`;
                });
            }
            else if (crStep === 7) { // REVIEW
                const cd = getActiveClassData();
                html += `<h3 class="text-white font-bold text-xl mb-4 display-font">Finalize Dossier</h3>`;
                html += `<input type="text" id="cr-wizard-name" value="${crState.name}" placeholder="Enter Operative Callsign" class="w-full bg-slate-900 border border-slate-600 text-white rounded p-3 text-lg font-bold uppercase tracking-widest datapad-font mb-4 focus:border-indigo-500 outline-none">`;
                
                html += `<div class="bg-slate-900/50 border border-slate-700 rounded p-3 mb-4 space-y-2">`;
                html += `<div class="flex justify-between"><span class="text-slate-500 uppercase text-[10px] font-bold tracking-widest">Species</span><span class="text-white text-sm font-bold">${crSpeciesOptions.find(s=>s.id===crState.species)?.sw || 'Unknown'}</span></div>`;
                html += `<div class="flex justify-between"><span class="text-slate-500 uppercase text-[10px] font-bold tracking-widest">Class</span><span class="text-white text-sm font-bold">${cd.sw} <span class="text-slate-500 text-[9px]">(${cd.dnd})</span> Lvl ${crState.level}</span></div>`;
                
                // Specialty line
                let specialtyStr = '';
                if (crState.cls === 'Ranger') {
                    const fsName = cd.fightingStyles ? (cd.fightingStyles.find(f=>f.id===crState.fightingStyle)?.name || 'None') : 'None';
                    const subName = cd.subclasses.find(s=>s.id===crState.subclass)?.name || 'None';
                    specialtyStr = `${fsName} / ${subName}`;
                } else {
                    const subName = cd.subclasses.find(s=>s.id===crState.subclass)?.name || 'None';
                    const mmNames = crState.metamagic.map(id => {
                        const mm = cd.metamagicOptions.find(m=>m.id===id);
                        return mm ? mm.name : id;
                    }).join(', ') || 'None';
                    specialtyStr = `${subName} — ${mmNames}`;
                }
                html += `<div class="flex justify-between"><span class="text-slate-500 uppercase text-[10px] font-bold tracking-widest">Specialty</span><span class="text-white text-sm font-bold text-right">${specialtyStr}</span></div>`;
                html += `<div class="flex justify-between mt-2 pt-2 border-t border-slate-800"><span class="text-slate-500 uppercase text-[10px] font-bold tracking-widest">Skills</span><span class="text-white text-xs text-right">${crState.selectedSkills.map(s=>s.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())).join(', ')}</span></div>`;
                html += `</div>`;
                
                html += `<div class="bg-indigo-900/20 border border-indigo-900 rounded p-3 flex justify-between items-center shadow-[0_0_15px_rgba(79,70,229,0.1)]">
                    <span class="text-indigo-400 font-bold uppercase tracking-widest text-xs">Ready for Deployment</span>
                    <svg class="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>`;
            }

            content.innerHTML = html;
        } catch (err) {
            console.error("Wizard Render Error:", err);
            const content = document.getElementById('cr-wizard-content');
            if (content) content.innerHTML = `<div class="p-10 text-center text-red-500 uppercase datapad-font">Critical Error in Wizard Logic<br><span class="text-[10px] text-slate-500 mt-2 block">${err.message}</span></div>`;
        }
    }

    function crWizardToggleSkill(sk) {
        if(crState.selectedSkills.includes(sk)) {
            crState.selectedSkills = crState.selectedSkills.filter(s=>s!==sk);
        } else {
            crState.selectedSkills.push(sk);
        }
        renderCreatorWizard();
    }

    function crWizardApplyArray() {
        if (crState.cls === 'Sorcerer') {
            crState.baseStats = {str:8,dex:13,con:14,int:10,wis:12,cha:15};
        } else if (crState.cls === 'Cleric') {
            crState.baseStats = {str:10,dex:12,con:14,int:8,wis:15,cha:13};
        } else {
            crState.baseStats = {str:10,dex:15,con:14,int:8,wis:13,cha:12};
        }
        renderCreatorWizard();
    }

    function crWizardToggleMetamagic(id) {
        if(crState.metamagic.includes(id)) {
            crState.metamagic = crState.metamagic.filter(m => m !== id);
        } else {
            if(crState.metamagic.length >= 2) {
                crState.metamagic.shift();
            }
            crState.metamagic.push(id);
        }
        renderCreatorWizard();
    }

    function getCrStatTotal(stat) {
        let total = crState.baseStats[stat] || 10;
        const sp = crSpeciesOptions.find(s=>s.id===crState.species);
        if (sp && sp.bonus) {
            if (sp.bonus[stat]) total += sp.bonus[stat];
        }
        if (crState.speciesBonuses[stat]) total += 1;
        return total;
    }

    function crWizardFinalize() {
        const nameInput = document.getElementById('cr-wizard-name');
        if (nameInput) crState.name = nameInput.value;
        if (!crState.name) { alert("Please enter a callsign."); return; }

        const cd = getActiveClassData();
        const sp = crSpeciesOptions.find(s=>s.id===crState.species);

        state.name = crState.name;
        state.cls = cd.dnd; 
        state.level = crState.level;
        
        state.stats = {
            str: getCrStatTotal('str'),
            dex: getCrStatTotal('dex'),
            con: getCrStatTotal('con'),
            int: getCrStatTotal('int'),
            wis: getCrStatTotal('wis'),
            cha: getCrStatTotal('cha')
        };
        
        // HP calculation based on class hit die
        const conMod = Math.floor((state.stats.con - 10) / 2);
        const hitDieMax = parseInt(cd.hitDie.slice(1)) || 8;
        const hitDieAvg = Math.floor(hitDieMax/2) + 1;
        
        let hp = hitDieMax + conMod;
        if(state.level > 1) {
            hp += (hitDieAvg + conMod) * (state.level - 1);
        }
        state.hp.max = Math.max(1, hp);
        state.hp.current = state.hp.max;
        
        state.speed = sp ? sp.speed : 30;
        if (crState.cls === 'Ranger' && state.level >= 6) state.speed += 5;
        
        // AC
        const dexMod = Math.floor((state.stats.dex - 10) / 2);
        if (crState.cls === 'Sorcerer') {
            state.ac = 10 + dexMod; 
        } else if (crState.cls === 'Cleric') {
            state.ac = 13 + Math.min(dexMod, 2); // Armored Flight Suit (Chain Shirt)
        } else {
            state.ac = 11 + dexMod; // leather
        }
        
        if (!state.proficiencies) state.proficiencies = { saves: [], skills: {} };
        state.proficiencies.saves = [...cd.saves];
        state.proficiencies.skills = {};
        crState.selectedSkills.forEach(s => state.proficiencies.skills[s] = 1);
        
        // Resources
        state.resources[0].name = "Hit Dice";
        state.resources[0].max = state.level;
        state.resources[0].current = state.level;
        
        if (crState.cls === 'Sorcerer') {
            state.resources[1].name = "Sorcery Pts";
            state.resources[1].max = Math.max(0, state.level); // sorcery points = level (starting at level 2, but max = level)
            state.resources[1].current = state.resources[1].max;
        } else {
            state.resources[1].name = "Spell Slots";
            state.resources[1].max = state.level >= 2 ? state.level : 0;
            state.resources[1].current = state.resources[1].max;
        }
        
        state.editMode = false;
        saveState();
        closeCreator();
        
        document.getElementById('setting-callsign').value = state.name;
        document.getElementById('setting-class').value = state.cls;
        document.getElementById('setting-level').value = state.level;
        updateIdentity();
        switchMainTab('character');
        
        const charEl = document.getElementById('main-character');
        if (charEl) {
            charEl.style.opacity = '0.5';
            setTimeout(() => charEl.style.opacity = '1', 150);
        }
    }

    function executeRest(type) {
        if (!confirm(`Take a ${type === 'long' ? 'Bacta Tank (Long Rest)' : 'Field Medic (Short Rest)'}? This will restore Hit Points and refresh resources.`)) return;
        
        state.hp.current = state.hp.max;
        
        if(type === 'long') {
            state.resources[0].current = state.resources[0].max;
            state.resources[1].current = state.resources[1].max;
            state.spellSlots = {}; // Flush Force Power slots
        }

        saveState();
        renderCharacterSheet();
        
        const charEl = document.getElementById('main-character');
        if (charEl) {
            charEl.style.opacity = '0.5';
            setTimeout(() => charEl.style.opacity = '1', 150);
        }
    }

    // --- CHARACTER SHEET FUNCTIONS ---
    function getSpellMod() {
        const cls = state.cls || "";
        let stat = "int"; // Default
        if (["Sorcerer", "Paladin", "Bard", "Warlock"].includes(cls)) stat = "cha";
        if (["Cleric", "Druid", "Ranger", "Monk"].includes(cls)) stat = "wis";
        return getMod(stat) + getProfBonus();
    }

    function rollSpellAttack(label) {
        rollDice(`${label} Attack`, getSpellMod());
    }

    function getMod(stat) {
        const score = state.stats[stat] || 10;
        return Math.floor((score - 10) / 2);
    }
    
    function getProfBonus() {
        return Math.floor((parseInt(state.level) - 1) / 4) + 2;
    }

    function toggleEditMode() {
        state.editMode = !state.editMode;
        const btn = document.getElementById('btn-edit-sheet');
        const lvlBtn = document.getElementById('btn-level-up');
        if (!btn) return;
        
        if (state.editMode) {
            btn.classList.add('bg-theme', 'text-slate-900');
            btn.style.backgroundColor = 'var(--hud)';
            btn.classList.remove('bg-slate-800', 'text-slate-300');
            btn.innerText = "Save Stats";
            if (lvlBtn) lvlBtn.classList.remove('hidden');
        } else {
            btn.classList.remove('bg-theme', 'text-slate-900');
            btn.style.backgroundColor = '';
            btn.classList.add('bg-slate-800', 'text-slate-300');
            btn.innerText = "Edit Stats";
            if (lvlBtn) lvlBtn.classList.add('hidden');
        }
        renderCharacterSheet();
    }

    function toggleProficiency(type, key) {
        if (!state.editMode) return;
        if (type === 'save') {
            const idx = state.proficiencies.saves.indexOf(key);
            if (idx > -1) state.proficiencies.saves.splice(idx, 1);
            else state.proficiencies.saves.push(key);
        } else if (type === 'skill') {
            const cur = state.proficiencies.skills[key] || 0;
            state.proficiencies.skills[key] = (cur + 1) % 3;
        }
        saveState();
        renderCharacterSheet();
    }

    function updateStat(stat, value) {
        state.stats[stat] = parseInt(value) || 10;
        saveState();
        renderCharacterSheet(); 
    }
    
    function editTitleInline() {
        let milestone = "Operative";
        if (typeof classMilestones !== 'undefined' && classMilestones[state.cls]) milestone = classMilestones[state.cls][(state.level || 1) - 1] || "Operative";
        const current = (state.customTitle && state.customTitle.trim() !== '') ? state.customTitle : '';
        const result = prompt(`Enter custom title/rank (leave blank for auto: "${milestone}"):`, current);
        if (result !== null) {
            state.customTitle = result;
            const titleInput = document.getElementById('setting-custom-title');
            if (titleInput) titleInput.value = result;
            saveState();
            updateIdentity();
        }
    }

    function updateCombatStat(stat, value) {
        if(stat === 'ac' || stat === 'speed') {
            state[stat] = parseInt(value) || 0;
        } else {
            state.hp[stat] = parseInt(value) || 0;
        }
        saveState();
    }

    function updateCredits(value) {
        state.credits = parseInt(value) || 0;
        saveState();
    }

    function updateSettingsResource(idx, field, value) {
        if(field === 'name') {
            state.resources[idx-1].name = value;
        } else {
            state.resources[idx-1].max = parseInt(value) || 0;
        }
        saveState();
        renderCharacterSheet();
    }

    function updateResource(idx, change) {
        if(state.editMode) return;
        const res = state.resources[idx-1];
        res.current += change;
        if(res.current > res.max) res.current = res.max;
        if(res.current < 0) res.current = 0;
        saveState();
        const el = document.getElementById(`res${idx}-cur`);
        if (el) el.innerText = res.current;
    }

    function levelUp() {
        if (!state.cls) { alert("Please compile a dossier first."); return; }
        if (state.level >= 20) { alert("Maximum operative level reached."); return; }
        
        state.level++;
        
        const conMod = Math.floor((state.stats.con - 10) / 2);
        let hitDieMax = 8;
        if (state.cls === 'Fighter') hitDieMax = 10;
        if (state.cls === 'Rogue') hitDieMax = 8;
        if (state.cls === 'Wizard') hitDieMax = 6;
        
        const hitDieAvg = Math.floor(hitDieMax/2) + 1;
        state.hp.max += (hitDieAvg + conMod);
        state.hp.current = state.hp.max;
        
        saveState();
        renderCharacterSheet();
        loadSettingsUI();
        
        const pulse = document.createElement('div');
        pulse.className = 'fixed inset-0 bg-indigo-500/20 pointer-events-none z-[15000] transition-opacity duration-1000 opacity-100';
        document.body.appendChild(pulse);
        setTimeout(() => pulse.style.opacity = '0', 10);
        setTimeout(() => pulse.remove(), 1000);
    }

    function getMaxSlots(level, cls) {
        const table = {
            "Fighter": {},
            "Rogue": {},
            "Cleric": {
                1: {1:2}, 2: {1:3}, 3: {1:4, 2:2}, 4: {1:4, 2:3}, 5: {1:4, 2:3, 3:2}, 6: {1:4, 2:3, 3:3}, 7: {1:4, 2:3, 3:3, 4:1}
            },
            "Sorcerer": {
                1: {1:2}, 2: {1:3}, 3: {1:4, 2:2}, 4: {1:4, 2:3}, 5: {1:4, 2:3, 3:2}, 6: {1:4, 2:3, 3:3}, 7: {1:4, 2:3, 3:3, 4:1}
            },
            "Ranger": {
                1: {}, 2: {1:2}, 3: {1:3}, 4: {1:3}, 5: {1:4, 2:2}, 6: {1:4, 2:2}, 7: {1:4, 2:3}
            }
        };
        return (table[cls] && table[cls][level]) || {};
    }

    function toggleSlot(lvl, index) {
        if(!state.spellSlots) state.spellSlots = {};
        state.spellSlots[lvl] = state.spellSlots[lvl] ^ (1 << index);
        saveState();
        renderCharacterSheet();
    }

    function renderCharacterSheet() {
        const pb = getProfBonus();
        const profEl = document.getElementById('char-prof');
        if (profEl) profEl.innerText = `+${pb}`;
        
        const init = getMod('dex');
        const initEl = document.getElementById('char-init');
        if (initEl) initEl.innerText = init >= 0 ? `+${init}` : init;

        // Health Bar Logic
        const hpPct = (state.hp.current / state.hp.max) * 100;
        const hpBarFill = document.getElementById('char-hp-bar-fill');
        if (hpBarFill) {
            hpBarFill.style.width = `${Math.min(100, Math.max(0, hpPct))}%`;
            const barColor = hpPct < 25 ? '#ef4444' : (hpPct < 50 ? '#f59e0b' : '#10b981');
            const barColorDeep = hpPct < 25 ? '#7f1d1d' : (hpPct < 50 ? '#78350f' : '#064e3b');
            hpBarFill.style.setProperty('--bar-color', barColor);
            hpBarFill.style.setProperty('--bar-color-deep', barColorDeep);
        }

        // Render Combat Stats & Wealth
        if(state.editMode) {
            document.getElementById('char-hp-cur').innerHTML = `<input type="number" value="${state.hp.current}" onchange="updateCombatStat('current', this.value)" class="char-input w-12 text-xl">`;
            document.getElementById('char-hp-max').innerHTML = `<input type="number" value="${state.hp.max}" onchange="updateCombatStat('max', this.value)" class="char-input w-10 text-sm">`;
            document.getElementById('char-ac').innerHTML = `<input type="number" value="${state.ac}" onchange="updateCombatStat('ac', this.value)" class="char-input w-12 text-xl">`;
            document.getElementById('char-speed').innerHTML = `<input type="number" value="${state.speed}" onchange="updateCombatStat('speed', this.value)" class="char-input w-12 text-xl">`;
            document.getElementById('char-credits-container').innerHTML = `<input type="number" value="${state.credits}" onchange="updateCredits(this.value)" class="char-input w-full text-base">`;
            
            // Resources Edit Mode
            [1, 2].forEach(idx => {
                document.getElementById(`res${idx}-name-display`).innerHTML = `<input type="text" value="${state.resources[idx-1].name}" onchange="updateSettingsResource(${idx}, 'name', this.value)" class="char-text-input">`;
                document.getElementById(`res${idx}-container`).innerHTML = `<input type="number" value="${state.resources[idx-1].max}" onchange="updateSettingsResource(${idx}, 'max', this.value)" class="char-input w-12 text-xl">`;
            });
            const restContainer = document.getElementById('rest-container');
            if(restContainer) restContainer.classList.add('hidden');

        } else {
            document.getElementById('char-hp-cur').innerText = state.hp.current;
            document.getElementById('char-hp-max').innerText = state.hp.max;
            document.getElementById('char-ac').innerText = state.ac;
            document.getElementById('char-speed').innerText = state.speed;
            document.getElementById('char-credits-container').innerHTML = `<span class="stat-value text-amber-400" id="char-credits">${state.credits}</span>`;
            
            // Resources Play Mode
            [1, 2].forEach(idx => {
                const res = state.resources[idx-1];
                document.getElementById(`res${idx}-name-display`).innerText = res.name;
                document.getElementById(`res${idx}-container`).innerHTML = `
                    <button onclick="updateResource(${idx}, -1)" class="resource-btn">-</button>
                    <div class="flex items-baseline gap-0.5 w-12 justify-center">
                        <span class="stat-value text-base" id="res${idx}-cur">${res.current}</span><span class="text-[10px] text-slate-500 font-mono">/<span id="res${idx}-max">${res.max}</span></span>
                    </div>
                    <button onclick="updateResource(${idx}, 1)" class="resource-btn">+</button>
                `;
            });
            const restContainer = document.getElementById('rest-container');
            if(restContainer) restContainer.classList.remove('hidden');
        }

        // Render Ability Scores
        ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(stat => {
            const mod = getMod(stat);
            document.getElementById(`mod-${stat}`).innerText = mod >= 0 ? `+${mod}` : mod;
            
            if (state.editMode) {
                document.getElementById(`score-${stat}`).innerHTML = `<input type="number" value="${state.stats[stat]}" onchange="updateStat('${stat}', this.value)" class="char-input w-10">`;
            } else {
                document.getElementById(`score-${stat}`).innerText = state.stats[stat];
            }
        });

        // Render Spell Slots
        const slotsContainer = document.getElementById('spell-slots-container');
        const slotsList = document.getElementById('slots-list');
        if (slotsContainer && slotsList) {
            const maxSlots = getMaxSlots(state.level, state.cls);
            if (Object.keys(maxSlots).length > 0) {
                slotsContainer.classList.remove('hidden');
                if(!state.spellSlots) state.spellSlots = {};
                slotsList.innerHTML = Object.entries(maxSlots).map(([lvl, max]) => {
                    let pips = '';
                    for(let i=0; i<max; i++) {
                        const isUsed = state.spellSlots[lvl] & (1 << i);
                        pips += `
                            <div onclick="toggleSlot(${lvl}, ${i})" class="w-6 h-6 rounded flex items-center justify-center border-2 cursor-pointer transition-all ${isUsed ? 'bg-red-500/20 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]' : 'border-hud-soft bg-slate-900 hover:border-hud'}">
                                ${isUsed ? '<svg class="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>' : ''}
                            </div>
                        `;
                    }
                    return `
                        <div class="flex items-center gap-4">
                            <div class="w-8 text-[10px] font-bold text-slate-500 uppercase tracking-widest">LVL ${lvl}</div>
                            <div class="flex gap-2">${pips}</div>
                        </div>
                    `;
                }).join('');
            } else {
                slotsContainer.classList.add('hidden');
            }
        }

        // Render Saves
        const savesContainer = document.getElementById('saves-list');
        if (savesContainer) {
            let savesHtml = '';
            ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(stat => {
                const isProf = state.proficiencies.saves.includes(stat);
                const statMod = getMod(stat);
                const total = statMod + (isProf ? pb : 0);
                const displayTotal = total >= 0 ? `+${total}` : total;
                const pipClass = isProf ? 'proficient' : '';

                // Beginner math string
                const mathStr = `(${stat.toUpperCase()} ${statMod >= 0 ? '+'+statMod : statMod}${isProf ? ' | PROF +'+pb : ''})`;

                savesHtml += `
                    <div class="skill-row" onclick="if(!state.editMode) { rollDice('${stat.toUpperCase()} Save', ${total}); } else { toggleProficiency('save', '${stat}'); }">
                        <div class="flex flex-col items-start pt-1">
                            <div class="flex items-center">
                                <span class="prof-pip ${pipClass}"></span>
                                <span class="text-sm font-bold text-slate-300 uppercase">${stat}</span>
                            </div>
                            <span class="beginner-tip text-[9px] text-slate-500 font-mono tracking-tighter mt-1 ml-5">${mathStr}</span>
                        </div>
                        <span class="text-hud font-mono font-bold">${displayTotal}</span>
                    </div>
                `;
            });
            savesContainer.innerHTML = savesHtml;
        }

        // Render Skills
        const skillsContainer = document.getElementById('skills-list');
        if (skillsContainer) {
            let skillsHtml = '';
            Object.keys(skillList).sort().forEach(skill => {
                const stat = skillList[skill];
                const profLevel = state.proficiencies.skills[skill] || 0; 
                const statMod = getMod(stat);
                let total = statMod + (profLevel * pb);
                const displayTotal = total >= 0 ? `+${total}` : total;
                
                let pipClass = '';
                if(profLevel === 1) pipClass = 'proficient';
                if(profLevel === 2) pipClass = 'expertise';

                const dndName = skill.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                const flavor = skillFlavor[skill] ? `<span class="text-[9px] block text-hud opacity-80 mt-0.5 hide-in-beginner">${dndName}</span>` : '';
                const mainName = skillFlavor[skill] ? skillFlavor[skill] : dndName;

                // Beginner math string
                let mathStr = `(${stat.toUpperCase()} ${statMod >= 0 ? '+'+statMod : statMod}`;
                if(profLevel === 1) mathStr += ` | PROF +${pb}`;
                if(profLevel === 2) mathStr += ` | EXP +${pb*2}`;
                mathStr += ')';

                skillsHtml += `
                    <div class="skill-row items-start" onclick="if(!state.editMode) { rollDice('${mainName.replace(/'/g, "\\'")}', ${total}); } else { toggleProficiency('skill', '${skill}'); }">
                        <div class="flex items-start pt-1">
                            <span class="prof-pip ${pipClass} mt-1"></span>
                            <div class="leading-tight">
                                <span class="text-sm font-bold text-slate-200">${mainName}</span>
                                <span class="text-[9px] text-slate-500 uppercase ml-1 hide-in-beginner">(${stat})</span>
                                ${flavor}
                                <div class="beginner-tip text-[9px] text-slate-500 font-mono tracking-tighter mt-1">${mathStr}</div>
                            </div>
                        </div>
                        <span class="text-hud font-mono font-bold mt-1">${displayTotal}</span>
                    </div>
                `;
            });
            skillsContainer.innerHTML = skillsHtml;
        }

        const btn = document.getElementById('btn-edit-sheet');
        if (btn) {
            if (state.editMode) {
                btn.classList.add('bg-theme', 'text-slate-900');
                btn.style.backgroundColor = 'var(--hud)';
                btn.classList.remove('bg-slate-800', 'text-slate-300');
                btn.innerText = "Save Stats";
            } else {
                btn.classList.remove('bg-theme', 'text-slate-900');
                btn.style.backgroundColor = '';
                btn.classList.add('bg-slate-800', 'text-slate-300');
                btn.innerText = "Edit Stats";
            }
        }
    }



    function closeDiceHUD() {
        const hud = document.getElementById('dice-hud');
        if(hud) hud.classList.remove('active');
    }

    function toggleGameLogTray() {
        const tray = document.getElementById('game-log-tray');
        if (tray) tray.classList.toggle('open');
    }

    async function rollShipDice(label, modifier, diceCount = 1) {
        const toast = document.getElementById('mini-dice-toast');
        const resEl = document.getElementById('mini-dice-result');
        if (!toast || !resEl) return;
        
        document.getElementById('mini-dice-label').innerText = label;
        document.getElementById('mini-dice-mod').innerText = modifier >= 0 ? `+${modifier}` : modifier;
        
        toast.classList.remove('translate-y-20', 'opacity-0');
        resEl.classList.remove('text-emerald-400', 'text-red-500', 'text-amber-400');
        resEl.classList.add('text-white');
        resEl.innerText = '--';

        // Adjust font size if there are multiple dice so they fit
        resEl.style.fontSize = diceCount > 2 ? '1.25rem' : '1.875rem';

        for(let i=0; i<10; i++) {
            if (diceCount > 1) {
                resEl.innerText = Array(diceCount).fill(0).map(() => Math.floor(Math.random() * 20) + 1).join('|');
            } else {
                resEl.innerText = Math.floor(Math.random() * 20) + 1;
            }
            await new Promise(r => setTimeout(r, 40));
        }

        let rolls = [];
        let hasCrit = false;
        let hasFail = false;
        
        for (let i = 0; i < diceCount; i++) {
            const roll = Math.floor(Math.random() * 20) + 1;
            if(roll === 20) hasCrit = true;
            if(roll === 1) hasFail = true;
            rolls.push(roll + modifier);
        }
        
        if(hasCrit && hasFail) { 
            resEl.classList.remove('text-white'); resEl.classList.add('text-amber-400');
        } else if (hasCrit) { 
            resEl.classList.remove('text-white'); resEl.classList.add('text-emerald-400');
        } else if (hasFail) { 
            resEl.classList.remove('text-white'); resEl.classList.add('text-red-500'); 
        }
        
        resEl.innerText = rolls.join(' | ');
        
        setTimeout(() => {
            toast.classList.add('translate-y-20', 'opacity-0');
        }, 4000);
    }

    function closeDiceHUD() {
        const hud = document.getElementById('dice-hud');
        if(hud) hud.classList.remove('active');
    }

    function rollItem(event, index, type) {
        event.stopPropagation(); 
        
        let mod = 0;
        let title = "";
        
        if (type === 'armory') {
            const item = armoryData[index];
            title = item.sw;
            const props = (item.props || '').toLowerCase();
            const isFinesse = props.includes('finesse');
            const isRanged = item.cat === 'Ranged' || props.includes('thrown');
            
            if (isRanged && !isFinesse) mod = getMod('dex');
            else if (isFinesse) mod = Math.max(getMod('str'), getMod('dex'));
            else mod = getMod('str');
            
            mod += getProfBonus();
            
        } else if (type === 'spell') {
            const spell = spellData[index];
            title = spell.sw;
            
            const cData = classData.find(c => c.dnd === state.cls);
            if(cData) {
                const p = cData.primary.toLowerCase();
                if(p.includes('cha')) mod = getMod('cha');
                else if(p.includes('wis')) mod = getMod('wis');
                else if(p.includes('int')) mod = getMod('int');
                else mod = getMod('int');
            }
            mod += getProfBonus();
        }

        rollDice(title, mod);
    }

    // --- NAVIGATION & SETTINGS LOGIC ---
    let currentMainTab = 'character';
    let currentDbTab = 'profiles';
    let previousMainTab = 'character';

    function switchMainTab(id) {
        if (id === 'settings' && currentMainTab === 'settings') {
            id = previousMainTab; 
        } else if (id !== 'settings') {
            previousMainTab = id;
        }
        currentMainTab = id;

        document.querySelectorAll('.main-tab').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.drawer-btn').forEach(el => el.classList.remove('active'));
        
        const tabEl = document.getElementById(`main-${id}`);
        if(tabEl) tabEl.classList.remove('hidden');
        
        const navEl = document.getElementById(`nav-${id}`);
        if(navEl) navEl.classList.add('active');

        const viewToggle = document.getElementById('btn-view-toggle');
        if (id === 'database') {
            viewToggle.classList.remove('hidden');
        } else if (id === 'ship') {
            viewToggle.classList.add('hidden');
            if (typeof renderNaviComputer === 'function') renderNaviComputer();
        } else {
            viewToggle.classList.add('hidden');
        }
        
        document.getElementById('main-content').scrollTo({top:0, behavior:'smooth'});
        closeAppDrawer();
    }

    function toggleAppDrawer() {
        const drawer = document.getElementById('app-drawer');
        if (drawer.classList.contains('active')) {
            drawer.classList.remove('active');
        } else {
            // Show/hide DM button based on verified status
            const dmBtn = document.getElementById('nav-dm');
            if (dmBtn) {
                if (state.isDM) { dmBtn.classList.remove('hidden'); } 
                else { dmBtn.classList.add('hidden'); }
            }
            drawer.classList.add('active');
        }
    }
    
    function closeAppDrawer() {
        document.getElementById('app-drawer').classList.remove('active');
    }

    function switchDbTab(id) {
        currentDbTab = id;
        document.querySelectorAll('.db-tab').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.db-nav-btn').forEach(el => el.classList.remove('active'));
        
        const target = document.getElementById(`db-tab-${id}`);
        if(target) target.classList.remove('hidden');
        
        const nav = document.getElementById(`db-nav-${id}`);
        if(nav) nav.classList.add('active');

        if (id === 'profiles') renderClasses();
        if (id === 'species') renderSpecies();
        if (id === 'planets') renderPlanets();
        if (id === 'armory') { renderArmoryFilters(); renderArmory(); }
        if (id === 'holocron') { renderHolocronFilters(); renderHolocron(); }
    }

    function toggleViewMode() {
        const isCompact = document.body.classList.contains('view-compact');
        setViewMode(isCompact ? 'standard' : 'compact');
    }

    function openSettingsModal() {
        const modal = document.getElementById('settings-modal');
        if(modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            setTimeout(() => { modal.style.opacity = '1'; }, 10);
        }
    }

    function closeSettingsModal() {
        const modal = document.getElementById('settings-modal');
        if(modal) {
            modal.style.opacity = '0';
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }, 300);
        }
    }

    function updateIdentity() {
        const nameInput = document.getElementById('setting-callsign').value;
        const titleInput = document.getElementById('setting-custom-title');
        const classInput = document.getElementById('setting-class').value;
        const levelInput = document.getElementById('setting-level').value;
        
        document.getElementById('level-display').innerText = levelInput;

        state.name = nameInput; state.cls = classInput; state.level = levelInput;
        if (titleInput) state.customTitle = titleInput.value;
        saveState();

        const displayName = nameInput.trim() === "" ? "Default User" : nameInput;
        let milestone = "Operative";
        if (typeof classMilestones !== 'undefined' && classMilestones[classInput]) milestone = classMilestones[classInput][levelInput - 1] || "Operative";
        
        const displayTitle = (state.customTitle && state.customTitle.trim() !== '') ? state.customTitle : milestone;
        document.getElementById('header-callsign').innerText = `${displayName} // Lvl ${levelInput} ${displayTitle}`;
        
        // Update character sheet title badge
        const titleBadge = document.getElementById('char-title-display');
        if (titleBadge) titleBadge.innerText = displayTitle;
        
        if(state.spellMine) { renderHolocronFilters(); renderHolocron(); }
        if(typeof renderCharacterSheet === 'function') renderCharacterSheet();
    }

    function updateAlignment(val) {
        val = parseInt(val);
        state.alignment = val;
        
        let theme = 'rebellion';
        let label = 'Rebellion / Light Side';
        let flick = 10, stat = 10, scan = 20;
        let isDark = false;

        switch(val) {
            case 1: theme = 'rebellion'; label = 'Rebellion / Light Side'; flick = 5; stat = 5; scan = 15; break;
            case 2: theme = 'jedi'; label = 'Jedi / Force Light'; flick = 15; stat = 15; scan = 25; break;
            case 3: theme = 'mando'; label = 'Mandalorian / Balanced'; flick = 30; stat = 30; scan = 40; break;
            case 4: theme = 'empire'; label = 'Empire / Dark Leaning'; flick = 60; stat = 60; scan = 60; break;
            case 5: theme = 'sith'; label = 'Sith / Dark Side Corrupted'; flick = 100; stat = 100; scan = 80; isDark = true; break;
        }

        const labelEl = document.getElementById('alignment-label');
        if(labelEl) {
            labelEl.innerText = label;
            labelEl.className = `text-center text-xs font-bold mt-3 uppercase tracking-widest datapad-font text-hud`;
        }
        
        setTheme(theme);
        updateVFX('flicker-intensity', flick);
        updateVFX('static-intensity', stat);
        updateVFX('scanline-intensity', scan);

        if(isDark) document.body.classList.add('dark-side-active');
        else document.body.classList.remove('dark-side-active');

        if(document.getElementById('vfx-flicker')) document.getElementById('vfx-flicker').value = flick;
        if(document.getElementById('vfx-static')) document.getElementById('vfx-static').value = stat;
        if(document.getElementById('vfx-scanlines')) document.getElementById('vfx-scanlines').value = scan;

        saveState();
    }

    function setTheme(themeName) {
        document.body.setAttribute('data-skin', themeName);
        document.querySelectorAll('.skin-swatch').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(`btn-theme-${themeName}`);
        if(activeBtn) activeBtn.classList.add('active');
        state.skin = themeName; saveState();
    }

    function toggleBeginnerMode(checked) {
        state.beginnerMode = checked;
        if(checked) document.body.classList.add('beginner-mode');
        else document.body.classList.remove('beginner-mode');
        saveState();
        renderCharacterSheet();
    }

    function setViewMode(mode) {
        if (mode === 'compact') { document.body.classList.add('view-compact'); } 
        else { document.body.classList.remove('view-compact'); }
        
        document.querySelectorAll('#btn-view-standard, #btn-view-compact').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(`btn-view-${mode}`);
        if(activeBtn) activeBtn.classList.add('active');

        state.viewmode = mode; saveState();
    }

    function setUIScale(size) {
        document.querySelectorAll('#btn-scale-sm, #btn-scale-md, #btn-scale-lg').forEach(btn => btn.classList.remove('active'));
        const btn = document.getElementById(`btn-scale-${size}`);
        if(btn) btn.classList.add('active');

        const html = document.documentElement;
        if (size === 'sm') html.style.fontSize = '13px';
        if (size === 'md') html.style.fontSize = '16px';
        if (size === 'lg') html.style.fontSize = '19px';
        state.uiscale = size; saveState();
    }
    
    function updateVFX(variableName, value) {
        const decimalValue = value / 100;
        document.documentElement.style.setProperty(`--${variableName}`, decimalValue);
        state[variableName.split('-')[0]] = value; saveState();
    }

    function updateSlot(val) {
        state.activeSlot = val;
        saveState();
        renderParty();
    }

    function loadSettingsUI() {
        const sel = document.getElementById('setting-class');
        if (sel) sel.innerHTML = `<option value="None">— Select Class —</option>` + classData.map(c=>`<option value="${c.dnd}">${c.dnd} → ${c.sw.split(' / ')[0]}</option>`).join('');
        
        const crSel = document.getElementById('cr-class');
        if (crSel) crSel.innerHTML = `<option value="">— Select Base Class —</option>` + classData.map(c=>`<option value="${c.dnd}">${c.dnd} → ${c.sw.split(' / ')[0]}</option>`).join('');

        const callsign = document.getElementById('setting-callsign');
        if (callsign) callsign.value = state.name || "";

        const titleInput = document.getElementById('setting-custom-title');
        if (titleInput) titleInput.value = state.customTitle || "";
        
        const clsSet = document.getElementById('setting-class');
        if (clsSet) clsSet.value = state.cls || "None";
        
        const lvlSet = document.getElementById('setting-level');
        if (lvlSet) lvlSet.value = state.level || 1;

        const slotSet = document.getElementById('setting-slot');
        if (slotSet) slotSet.value = state.activeSlot || "slot1";
        
        const begSet = document.getElementById('setting-beginner');
        if (begSet) begSet.checked = state.beginnerMode || false;

        updateIdentity();

        if (state.alignment) {
            const alignSet = document.getElementById('setting-alignment');
            if (alignSet) alignSet.value = state.alignment;
            updateAlignment(state.alignment);
        } else {
            let savedTheme = state.skin;
            if (savedTheme === 'blue') savedTheme = 'rebellion';
            if (savedTheme === 'red') savedTheme = 'empire';
            if (savedTheme === 'amber') savedTheme = 'mando';
            if (savedTheme === 'green') savedTheme = 'jedi';
            if (savedTheme) { setTheme(savedTheme); }
        }

        if (state.viewmode) { setViewMode(state.viewmode); }
        if (state.uiscale) { setUIScale(state.uiscale); }
        
        ['scanline', 'flicker', 'static'].forEach(effect => {
            const val = state[effect === 'scanline' ? 'scan' : effect] !== undefined ? state[effect === 'scanline' ? 'scan' : effect] : (effect==='scanline'?30:effect==='static'?10:5);
            const slider = document.getElementById(`vfx-${effect === 'scanline' ? 'scanlines' : effect}`);
            if(slider) slider.value = val;
            document.documentElement.style.setProperty(`--${effect}-intensity`, val / 100);
        });
    }

    function resetAll() {
        if (!confirm("Purge all settings, character, and saved items? This cannot be undone.")) return;
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
    }

    // --- SHIP LOGIC ---
    function renderShip() {
        if(!state.ship) return;
        
        document.getElementById('ship-name-display').innerText = state.ship.name || "Vessel Interface";
        
        let typeStr = "Light Freighter";
        let svgContent = `
            <g class="ship-path transition-all duration-300">
                <circle cx="50" cy="55" r="35" fill="#334155" stroke="#64748b" stroke-width="2"/>
                <path d="M 25 35 L 25 5 L 40 5 L 45 30 Z" fill="#334155" stroke="#64748b" stroke-width="2"/>
                <path d="M 75 35 L 75 5 L 60 5 L 55 30 Z" fill="#334155" stroke="#64748b" stroke-width="2"/>
                <path d="M 82 45 L 95 35 L 90 60 L 85 55 Z" fill="#334155" stroke="#64748b" stroke-width="2"/>
                <circle cx="90" cy="48" r="4" fill="#38bdf8"/>
                <path d="M 25 85 Q 50 95 75 85" fill="none" stroke="#38bdf8" stroke-width="4" class="animate-pulse"/>
                <circle cx="50" cy="55" r="15" fill="#1e293b" stroke="#475569" stroke-width="1"/>
                <circle cx="50" cy="55" r="5" fill="#0f172a"/>
            </g>`;
            
        if (state.ship.type === 'gunship' || state.ship.type === 'fighter') {
            typeStr = "Assault Gunship";
            svgContent = `
            <g class="ship-path transition-all duration-300">
                <path d="M 40 20 L 60 20 L 65 50 L 60 85 L 40 85 L 35 50 Z" fill="#64748b" stroke="#94a3b8" stroke-width="1"/>
                <path d="M 45 25 L 55 25 L 58 35 L 42 35 Z" fill="#0ea5e9"/>
                <rect x="20" y="35" width="15" height="40" rx="5" fill="#475569" stroke="#94a3b8" stroke-width="1"/>
                <rect x="65" y="35" width="15" height="40" rx="5" fill="#475569" stroke="#94a3b8" stroke-width="1"/>
                <rect x="35" y="45" width="5" height="10" fill="#334155"/>
                <rect x="60" y="45" width="5" height="10" fill="#334155"/>
                <circle cx="27.5" cy="78" r="4" fill="#f59e0b" class="animate-pulse"/>
                <circle cx="72.5" cy="78" r="4" fill="#f59e0b" class="animate-pulse"/>
                <circle cx="45" cy="88" r="3" fill="#f59e0b" class="animate-pulse"/>
                <circle cx="55" cy="88" r="3" fill="#f59e0b" class="animate-pulse"/>
            </g>`;
        } else if (state.ship.type === 'cruiser') {
            typeStr = "Heavy Cruiser";
            svgContent = `
            <g class="ship-path transition-all duration-300">
                <rect x="25" y="20" width="50" height="45" rx="3" fill="#475569" stroke="#94a3b8" stroke-width="1"/>
                <path d="M 25 25 L 8 30 L 5 50 L 8 55 L 25 50 Z" fill="#475569" stroke="#94a3b8" stroke-width="1"/>
                <path d="M 75 25 L 92 30 L 95 50 L 92 55 L 75 50 Z" fill="#475569" stroke="#94a3b8" stroke-width="1"/>
                <rect x="5" y="35" width="6" height="12" rx="2" fill="#334155" stroke="#64748b" stroke-width="0.5"/>
                <rect x="89" y="35" width="6" height="12" rx="2" fill="#334155" stroke="#64748b" stroke-width="0.5"/>
                <ellipse cx="50" cy="18" rx="12" ry="10" fill="#334155" stroke="#94a3b8" stroke-width="1"/>
                <ellipse cx="50" cy="16" rx="7" ry="5" fill="#0f172a" stroke="#38bdf8" stroke-width="0.5" opacity="0.8"/>
                <circle cx="50" cy="16" r="2" fill="#38bdf8" opacity="0.6"/>
                <line x1="50" y1="20" x2="50" y2="65" stroke="#334155" stroke-width="1"/>
                <line x1="25" y1="40" x2="75" y2="40" stroke="#334155" stroke-width="0.5"/>
                <path d="M 30 65 L 70 65 L 68 75 L 32 75 Z" fill="#3f4f63" stroke="#64748b" stroke-width="1"/>
                <rect x="28" y="75" width="10" height="12" fill="#475569" stroke="#64748b" stroke-width="0.8"/>
                <rect x="62" y="75" width="10" height="12" fill="#475569" stroke="#64748b" stroke-width="0.8"/>
                <rect x="25" y="85" width="16" height="10" rx="3" fill="#334155" stroke="#94a3b8" stroke-width="1"/>
                <rect x="59" y="85" width="16" height="10" rx="3" fill="#334155" stroke="#94a3b8" stroke-width="1"/>
                <circle cx="33" cy="95" r="4" fill="#38bdf8" class="animate-pulse"/>
                <circle cx="67" cy="95" r="4" fill="#38bdf8" class="animate-pulse"/>
            </g>`;
        }
        
        document.getElementById('ship-class-display').innerText = typeStr;
        const svgWrapper = document.getElementById('ship-svg-wrapper');
        if (svgWrapper) {
            svgWrapper.innerHTML = `<svg viewBox="0 0 100 100" class="w-32 h-32 text-slate-300">${svgContent}</svg>`;
        }

        const hullBadge = document.getElementById('ship-hull-badge');
        const hCur = document.getElementById('ship-stat-hull-cur');
        const hMax = document.getElementById('ship-stat-hull-max');
        if (hullBadge && hCur && hMax) {
            hullBadge.innerText = `${state.ship.hullCur} HP`;
            hCur.innerText = state.ship.hullCur;
            hMax.innerText = state.ship.hullMax;
            
            // Critical Damage overlay
            if (state.ship.hullCur < (state.ship.hullMax * 0.3)) {
                hullBadge.classList.replace('text-emerald-400', 'text-red-500');
                hullBadge.classList.replace('border-emerald-900', 'border-red-600');
                hCur.classList.replace('text-emerald-400', 'text-red-500');
                
                // Add blinking red border to container
                const container = document.getElementById('ship-visual-container');
                if (container) container.classList.add('animate-pulse', 'border-red-500/50');
            } else {
                hullBadge.classList.replace('text-red-500', 'text-emerald-400');
                hullBadge.classList.replace('border-red-600', 'border-emerald-900');
                hCur.classList.replace('text-red-500', 'text-emerald-400');
                const container = document.getElementById('ship-visual-container');
                if (container) container.classList.remove('animate-pulse', 'border-red-500/50');
            }
        }

        const sBadge = document.getElementById('ship-shield-badge');
        const contactsG = document.getElementById('tactical-contacts');

        if (sBadge) {
            const val = state.ship.shieldsCur || 0;
            const max = state.ship.shieldsMax || 1; // avoid div by zero
            sBadge.innerText = `${val}/${max} SHIELDS`;

            // Update 4 shield quadrants
            const percent = val / max;
            const shieldIds = ['shield-forward', 'shield-port', 'shield-starboard', 'shield-aft'];
            shieldIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (percent <= 0) {
                        el.style.opacity = '0';
                    } else if (percent < 0.3) {
                        el.style.opacity = '0.4';
                        el.setAttribute("stroke", "#ef4444"); // Red when low
                    } else if (percent < 0.6) {
                        el.style.opacity = '0.6';
                        el.setAttribute("stroke", "#f59e0b"); // Yellow when med
                    } else {
                        el.style.opacity = '0.8';
                        el.setAttribute("stroke", "#3b82f6"); // Blue when high
                    }
                }
            });
            
            const sCur = document.getElementById('ship-stat-shields-cur');
            const sMax = document.getElementById('ship-stat-shields-max');
            if (sCur && sMax) {
                sCur.innerText = val;
                sMax.innerText = max;
                if (percent <= 0) sCur.classList.replace('text-blue-400', 'text-slate-600');
                else sCur.classList.replace('text-slate-600', 'text-blue-400');
            }
        }

        // Render Enemy Dots on Scope using Polar Coordinates
        if (contactsG) {
            contactsG.innerHTML = (state.enemies || []).filter(e => e.visible).map((e, idx) => {
                // If they don't have polar coords yet, generate some fallback
                let angle = e.radarAngle !== undefined ? e.radarAngle : Math.random() * Math.PI * 2;
                let dist = e.radarDist !== undefined ? e.radarDist : 20 + Math.random() * 20;
                
                // Convert polar to cartesian (center is 50,50)
                let x = 50 + dist * Math.cos(angle);
                let y = 50 + dist * Math.sin(angle);
                
                let color = "#ef4444"; // red for hostile/unknown
                if (e.affiliation === 'Civilian') color = "#38bdf8"; // blue
                if (e.affiliation === 'Pirate') color = "#a855f7"; // purple

                return `<circle cx="${x}" cy="${y}" r="2" fill="${color}" class="animate-ping" style="animation-duration: 2s;"/><circle cx="${x}" cy="${y}" r="1.5" fill="${color}"/>`;
            }).join('');
        }

        renderMannedStations();
    }

    function renderEnemies() {
        const panel = document.getElementById('enemy-scanner-panel');
        const container = document.getElementById('enemy-list-container');
        if (!panel || !container) return;
        
        const activeEnemies = (state.enemies || []).filter(e => e.visible);
        if (activeEnemies.length === 0) {
            panel.classList.add('hidden');
            return;
        }
        
        panel.classList.remove('hidden');
        container.innerHTML = activeEnemies.map((e, idx) => {
            let colorClass = "text-red-500";
            if (e.affiliation === 'Civilian') colorClass = "text-blue-400";
            if (e.affiliation === 'Pirate') colorClass = "text-purple-400";
            
            let content = '';
            if (e.stage === 1) {
                content = `
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full border border-slate-800 flex items-center justify-center">
                            <div class="w-2 h-2 rounded-full animate-pulse" style="background-color: currentColor"></div>
                        </div>
                        <div>
                            <div class="text-[10px] font-bold uppercase tracking-widest ${colorClass}">${e.affiliation || 'Unknown'} Contact</div>
                            <div class="text-[8px] text-slate-500 font-mono">Distance: Critical // Bearings: Variable</div>
                        </div>
                    </div>
                `;
            } else if (e.stage === 2) {
                content = `
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-3">
                            <div class="${colorClass}"><svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2l-6 16h12L10 2z"/></svg></div>
                            <div>
                                <div class="text-[10px] font-bold uppercase tracking-widest ${colorClass}">${e.affiliation} ${e.class} Signature</div>
                                <div class="text-[8px] text-slate-500 font-mono">Sensors Locked // Auto-Tracking Active</div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                const hpPct = (e.hpCur / e.hpMax) * 100;
                const shPct = (e.shCur / e.shMax) * 100;
                content = `
                    <div class="space-y-2">
                        <div class="flex justify-between items-end">
                            <div>
                                <div class="text-xs text-white font-bold uppercase display-font">${e.name}</div>
                                <div class="text-[8px] font-mono uppercase tracking-widest ${colorClass}">${e.affiliation} // ${e.class} // AC: ${e.ac}</div>
                            </div>
                            <div class="text-right">
                                <span class="text-[9px] text-slate-400 font-mono">HULL: ${e.hpCur}/${e.hpMax}</span>
                            </div>
                        </div>
                        <div class="h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                            <div class="h-full bg-emerald-500 transition-all duration-500" style="width: ${hpPct}%"></div>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-[9px] text-blue-400 font-mono uppercase">Shields</span>
                            <span class="text-[9px] text-blue-300 font-mono">${e.shCur}/${e.shMax}</span>
                        </div>
                        <div class="h-1 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                            <div class="h-full bg-blue-500 transition-all duration-500" style="width: ${shPct}%"></div>
                        </div>
                    </div>
                `;
            }
            
            return `
                <div class="bg-slate-900/60 border border-slate-800 rounded p-3 relative overflow-hidden" id="enemy-card-${idx}">
                    <div class="absolute inset-0 bg-white/5 pointer-events-none"></div>
                    <div class="${colorClass}">${content}</div>
                </div>
            `;
        }).join('');
    }

    function addEnemyShip() {
        if (!state.enemies) state.enemies = [];
        
        // Random polar coords for tactical radar
        // distance from center 0 to 45 (radius of radar)
        const angle = Math.random() * Math.PI * 2;
        const dist = 10 + Math.random() * 30; // Between 10 and 40 units from center
        
        state.enemies.push({
            name: "Unknown Contact " + Math.floor(Math.random()*1000),
            affiliation: 'Unknown',
            class: 'Fighter',
            visible: true,
            stage: 1, // 1 = blip, 2 = identified
            radarAngle: angle,
            radarDist: dist
        });
        saveState();
        firebaseSync('shared/enemies', state.enemies);
        renderDMEnemies();
    }



    function switchShipTab(id) {
        document.querySelectorAll('.ship-tab').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.db-nav-btn').forEach(el => el.classList.remove('active'));
        
        const tabEl = document.getElementById(`ship-tab-${id}`);
        if(tabEl) tabEl.classList.remove('hidden');
        
        const navEl = document.getElementById(`ship-nav-${id}`);
        if(navEl) navEl.classList.add('active');

        if(id === 'navicomputer') renderNaviComputer();
    }

    function claimStation(stationId) {
        if (!state.ship.stations) state.ship.stations = { helm: null, gunnery: null, engineering: null };
        
        // Prevent DM from sitting unless they assume a player slot
        if (state.isDM && (!state.activeSlot || !state.activeSlot.startsWith('slot'))) {
            showHolonetAlert("Administrative Access Only: Bridge seating restricted.", "border-red-900 bg-red-950/80");
            return;
        }

        const currentlyOccupiedByMe = Object.keys(state.ship.stations).find(k => state.ship.stations[k] === state.activeSlot);
        
        if (state.ship.stations[stationId] === state.activeSlot) {
            state.ship.stations[stationId] = null; // unseat
        } else if (!state.ship.stations[stationId]) {
            if(currentlyOccupiedByMe) state.ship.stations[currentlyOccupiedByMe] = null; // move from old seat
            state.ship.stations[stationId] = state.activeSlot; // take new seat
        }
        
        saveState();
        firebaseSync('shared/ship', state.ship);
        renderShip();
    }

    function calculateJumps(fromName, toName) {
        if (fromName === toName) return 0;
        const p1 = planetData.find(p => p.name === fromName);
        const p2 = planetData.find(p => p.name === toName);
        if (!p1 || !p2) return 1;
        const dist = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
        if (dist < 20) return 1;
        if (dist < 45) return 2;
        if (dist < 75) return 3;
        return 4;
    }

    let selectedPlanet = null;

    function renderNaviComputer() {
        const currentLocName = state.ship.location || "Coruscant";
        const locDisplay = document.getElementById('ship-location-display');
        if(locDisplay) locDisplay.innerText = currentLocName;
        
        const planetsG = document.getElementById('starmap-planets');
        if (!planetsG) return;
        
        const svgNS = "http://www.w3.org/2000/svg";
        planetsG.innerHTML = '';

        const currentPlanet = planetData.find(p => p.name === currentLocName);
        const margin = 5;
        
        planetData.forEach(p => {
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
            const shortName = p.name.includes(' (') ? p.name.split(' (')[0] : p.name;
            label.textContent = shortName.length > 12 ? shortName.substring(0,10) + ".." : shortName;
            g.appendChild(label);
            
            planetsG.appendChild(g);
        });
        
        // If a planet was selected, re-select it to update the route line
        if (selectedPlanet) selectPlanetOnMap(selectedPlanet);
    }

    function selectPlanetOnMap(planetName) {
        selectedPlanet = planetName;
        const currentLocName = state.ship.location || "Coruscant";
        const panel = document.getElementById('starmap-info-panel');
        const route = document.getElementById('starmap-route');
        if (!panel || !route) return;

        const planet = planetData.find(p => p.name === planetName);
        if (!planet) return;
        
        const isCurrent = planetName === currentLocName;
        const jumps = calculateJumps(currentLocName, planetName);
        const margin = 5;
        
        // Draw route line from current to selected
        const curPlanet = planetData.find(p => p.name === currentLocName);
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
        
        // Fill info panel
        document.getElementById('starmap-info-name').innerText = planet.name;
        document.getElementById('starmap-info-desc').innerText = planet.desc;
        document.getElementById('starmap-info-env').innerText = planet.env || 'Unknown';
        document.getElementById('starmap-info-climate').innerText = planet.climate || 'Unstable';
        document.getElementById('starmap-info-coords').innerText = `SECTOR: ${planet.x}, ${planet.y}`;
        document.getElementById('starmap-info-jumps').innerText = isCurrent ? 'ORBITAL LOCK' : jumps + ' JUMPS';
        
        const bg = document.getElementById('starmap-planet-bg');
        if (bg) {
            bg.className = `h-24 w-full bg-gradient-to-br ${planet.color || 'from-indigo-900 to-slate-900'} relative transition-all duration-700`;
        }

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

    function jumpToPlanet(targetName, jumps) {
        if (!state.ship.stations) return;
        
        // Find who is sitting in helm
        const pilotSlot = state.ship.stations.helm;
        let pilotMod = 0;
        
        if (pilotSlot && partyData[pilotSlot] && partyData[pilotSlot].stats) {
            // Assume Intelligence (Astrogation) is used for jumping safely
            const intel = partyData[pilotSlot].stats['int'] || 10;
            pilotMod = Math.floor((intel - 10) / 2);
        }

        // Trigger ship VFX
        const shipWrapper = document.getElementById('ship-svg-wrapper');
        if(shipWrapper) {
            switchShipTab('vessel');
            const starmapContainer = document.getElementById('starmap-svg');
            if (starmapContainer) {
                starmapContainer.classList.remove('animate-pulse');
                void starmapContainer.offsetWidth;
                starmapContainer.classList.add('animate-pulse');
            }
            shipWrapper.classList.remove('animate-ship-hyperspace');
            void shipWrapper.offsetWidth; 
            shipWrapper.classList.add('animate-ship-hyperspace');
        }

        // Send chat alert
        const alertMsg = `JUMPING TO ${targetName.toUpperCase()}: INITIATING ${jumps} HYPER-JUMPS.`;
        firebaseSync('shared/broadcast', { message: alertMsg, timestamp: Date.now() });

        // Roll the dice for hazards
        rollShipDice(`JUMP: ${targetName}`, pilotMod, jumps);
        
        // Update Location
        state.ship.location = targetName;
        saveState();
        firebaseSync('shared/ship', state.ship);
    }

    function forceJumpDM(targetName) {
        state.ship.location = targetName;
        saveState();
        firebaseSync('shared/ship', state.ship);
        renderNaviComputer();
    }

    function shipAction(action, statStr, stationId) {
        const shipWrapper = document.getElementById('ship-svg-wrapper');
        const vfx = document.getElementById('ship-vfx');
        
        if (action === 'hyperspace') {
            shipWrapper.classList.remove('animate-ship-hyperspace');
            void shipWrapper.offsetWidth; 
            shipWrapper.classList.add('animate-ship-hyperspace');
            switchShipTab('navicomputer');
            return;
        }
        
        if (action === 'fire_lasers') {
            vfx.innerHTML = `<rect x="48" y="0" width="4" height="20" fill="#22c55e" class="animate-ship-laser"/>`;
        } else if (action === 'evade') {
            shipWrapper.classList.remove('animate-ship-evade');
            void shipWrapper.offsetWidth;
            shipWrapper.classList.add('animate-ship-evade');
        } else if (action === 'torpedo') {
            vfx.innerHTML = `<circle cx="50" cy="50" r="5" fill="#60a5fa" class="animate-ship-torpedo" style="filter: drop-shadow(0 0 10px #3b82f6);"/>`;
        } else if (action === 'attack_run') {
            vfx.innerHTML = `<circle cx="50" cy="50" r="100" fill="none" stroke="#ef4444" stroke-width="2" class="animate-ship-sweep"/>`;
        } else if (action === 'intimidate') {
            vfx.innerHTML = `<rect x="30" y="0" width="2" height="20" fill="#ef4444" class="animate-ship-laser"/><rect x="70" y="0" width="2" height="20" fill="#ef4444" class="animate-ship-laser"/>`;
        } else if (action === 'reroute') {
            vfx.innerHTML = `<circle cx="50" cy="50" r="45" fill="none" stroke="#3b82f6" stroke-width="4" class="animate-ship-shield-pulse"/>`;
        } else if (action === 'patch') {
            vfx.innerHTML = `
                <circle cx="50" cy="50" r="2" fill="#facc15" style="--tx: -30px; --ty: -30px;" class="animate-ship-spark"/>
                <circle cx="50" cy="50" r="2" fill="#facc15" style="--tx: 30px; --ty: -10px;" class="animate-ship-spark"/>
                <circle cx="50" cy="50" r="2" fill="#facc15" style="--tx: -10px; --ty: 40px;" class="animate-ship-spark"/>
            `;
        } else if (action === 'overload') {
            vfx.innerHTML = `<circle cx="50" cy="50" r="20" fill="none" stroke="#a855f7" stroke-width="4" class="animate-ship-slice"/>`;
        } else if (action === 'brace') {
            shipWrapper.classList.remove('animate-ship-evade');
            void shipWrapper.offsetWidth;
            shipWrapper.style.transform = "scale(0.95)";
            setTimeout(() => { shipWrapper.style.transform = "scale(1)"; }, 300);
        }

        setTimeout(() => { if(vfx) vfx.innerHTML = ''; }, 1500);

        if (statStr !== 'None') {
            let activeMod = 0;
            const occupantSlot = (state.ship.stations && stationId) ? state.ship.stations[stationId] : null;
            
            if (occupantSlot && partyData[occupantSlot] && partyData[occupantSlot].stats) {
                const score = partyData[occupantSlot].stats[statStr] || 10;
                // Add prof bonus? The user might not have standard prof. Let's just use the party member's level.
                const profBonus = Math.floor(((partyData[occupantSlot].level || 1) - 1) / 4) + 2;
                activeMod = Math.floor((score - 10) / 2) + profBonus;
            } else {
                activeMod = Math.floor(((state.stats[statStr] || 10) - 10) / 2) + getProfBonus();
            }

            let labelStr = action.replace(/_/g, ' ').toUpperCase();
            if (occupantSlot && partyData[occupantSlot].name) {
                labelStr = `${partyData[occupantSlot].name}: ${labelStr}`;
            }
            rollShipDice(labelStr, activeMod, 1);

            // Hit detection for enemies
            if (action === 'fire_lasers' || action === 'torpedo') {
                const roll = Math.floor(Math.random() * 20) + 1;
                const total = roll + activeMod;
                const hitEnemyIdx = (state.enemies || []).findIndex(e => e.visible && total >= e.ac);
                if (hitEnemyIdx !== -1) triggerDamageAnim(hitEnemyIdx);
            }
        }
    }

    function triggerDamageAnim(idx) {
        const card = document.getElementById(`enemy-card-${idx}`);
        if (!card) return;
        
        card.classList.add('animate-shake');
        const flash = document.createElement('div');
        flash.className = 'absolute inset-0 bg-red-500/40 z-50 pointer-events-none';
        card.appendChild(flash);
        
        setTimeout(() => {
            card.classList.remove('animate-shake');
            flash.remove();
        }, 500);
    }

    // --- BOUNTY LOGIC ---
    function updateBountyStatus(id, newStatus) {
        if(!state.bountiesStatus) state.bountiesStatus = {};
        state.bountiesStatus[id] = newStatus;
        saveState();
        firebaseSync('shared/bounties', state.bountiesStatus);
        renderBounties();
    }

    function renderBounties() {
        const c = document.getElementById('bounties-container');
        if (!c) return;
        
        const allBounties = [...bountyData, ...(state.customBounties || [])];
        c.innerHTML = allBounties.map(b => {
            const status = state.bountiesStatus[b.id] || b.defaultStatus;
            let statusColor = "text-hud";
            if (status === 'Captured' || status === 'Completed') statusColor = "text-emerald-400";
            if (status === 'Terminated' || status === 'Failed') statusColor = "text-red-500";
            
            return `
            <div class="data-card p-4">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <h3 class="text-lg font-bold leading-tight display-font glow-text-hud text-white">${b.name}</h3>
                        <span class="datapad-font text-[10px] uppercase tracking-widest mt-1 block" style="color: var(--accent);">${b.role}</span>
                    </div>
                    <span class="datapad-font text-xs font-bold uppercase ${statusColor} bg-slate-900 border border-slate-700 px-2 py-1 rounded">${status}</span>
                </div>
                <p class="text-sm text-slate-300 mb-3">${b.desc}</p>
                <div class="grid grid-cols-2 gap-2 mb-3">
                    <div class="bg-slate-900/50 p-2 rounded border border-slate-800">
                        <span class="text-[9px] uppercase font-bold block mb-1 text-slate-500 datapad-font tracking-widest">Location</span>
                        <span class="text-xs text-white datapad-font">${b.location}</span>
                    </div>
                    <div class="bg-slate-900/50 p-2 rounded border border-slate-800">
                        <span class="text-[9px] uppercase font-bold block mb-1 text-slate-500 datapad-font tracking-widest">Reward/Value</span>
                        <span class="text-xs text-white datapad-font">${b.reward}</span>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="updateBountyStatus('${b.id}', 'Captured')" class="flex-1 border border-emerald-900 text-emerald-500 text-xs py-1 rounded bg-slate-900 hover:bg-emerald-900/30 uppercase datapad-font transition-colors">Capture</button>
                    <button onclick="updateBountyStatus('${b.id}', 'Terminated')" class="flex-1 border border-red-900 text-red-500 text-xs py-1 rounded bg-slate-900 hover:bg-red-900/30 uppercase datapad-font transition-colors">Terminate</button>
                    ${b.id.startsWith('custom_') ? 
                        `<button onclick="deleteCustomBounty('${b.id}')" class="flex-1 border border-red-900 text-red-500 text-xs py-1 rounded bg-slate-900 hover:bg-red-900/30 uppercase datapad-font transition-colors">Delete</button>` :
                        `<button onclick="updateBountyStatus('${b.id}', 'Active')" class="flex-1 border border-slate-700 text-slate-400 text-xs py-1 rounded bg-slate-900 hover:bg-slate-800 uppercase datapad-font transition-colors">Reset</button>`
                    }
                </div>
            </div>`;
        }).join('');
    }

    // --- SHIP ALERT SOUND SYSTEM ---
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        const SHIP_ALERTS = [
        {id:'red_alert', name:'Red Alert', icon:'🚨', color:'text-red-500 border-red-900 bg-red-950/50', colorHex:'#ef4444', desc:'Combat stations! All hands!', freq:[440,880], type:'square', pattern:[0.15,0.1,0.15,0.1,0.3]},
        {id:'proximity', name:'Proximity Warning', icon:'🛰️', color:'text-amber-400 border-amber-900 bg-amber-950/50', colorHex:'#f59e0b', desc:'Unknown contacts detected', freq:[600,400], type:'sine', pattern:[0.3,0.2,0.3]},
        {id:'hull_breach', name:'Hull Breach', icon:'💥', color:'text-orange-500 border-orange-900 bg-orange-950/50', colorHex:'#f97316', desc:'Structural integrity failing', freq:[200,150,100], type:'sawtooth', pattern:[0.5,0.1,0.5]},
        {id:'power_fail', name:'Power Failure', icon:'⚡', color:'text-purple-400 border-purple-900 bg-purple-950/50', colorHex:'#a855f7', desc:'Main reactor offline', freq:[300,200], type:'triangle', pattern:[0.8,0.3,0.4]},
        {id:'hyperdrive', name:'Hyperdrive Alert', icon:'🌌', color:'text-blue-400 border-blue-900 bg-blue-950/50', colorHex:'#60a5fa', desc:'Hyperdrive malfunction', freq:[500,700,900], type:'sine', pattern:[0.2,0.1,0.2,0.1,0.2]},
        {id:'all_clear', name:'All Clear', icon:'✅', color:'text-emerald-400 border-emerald-900 bg-emerald-950/50', colorHex:'#34d399', desc:'Threat neutralized', freq:[523,659,784], type:'sine', pattern:[0.3,0.05,0.3,0.05,0.6]}
    ];

    function playAlertSound(alert) {
        try {
            audioCtx.resume();
            let t = audioCtx.currentTime;
            alert.freq.forEach((freq, fi) => {
                alert.pattern.forEach((dur, i) => {
                    if (i % 2 === 0) {
                        const osc = audioCtx.createOscillator();
                        const gain = audioCtx.createGain();
                        osc.type = alert.type;
                        osc.frequency.value = freq;
                        gain.gain.setValueAtTime(0.25, t);
                        gain.gain.exponentialRampToValueAtTime(0.01, t + dur);
                        osc.connect(gain);
                        gain.connect(audioCtx.destination);
                        osc.start(t);
                        osc.stop(t + dur);
                    }
                    t += dur;
                });
            });
        } catch(e) { console.warn('Audio failed:', e); }
    }

    function playTypeSound() {
        try {
            audioCtx.resume();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800 + Math.random() * 200, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.05);
        } catch(e) {}
    }

    
    
    window.triggerShipCombatRoll = function(source) {
        const d20 = Math.floor(Math.random() * 20) + 1;
        // Ship damage: 3d10 for a standard laser battery
        const d1 = Math.floor(Math.random() * 10) + 1;
        const d2 = Math.floor(Math.random() * 10) + 1;
        const d3 = Math.floor(Math.random() * 10) + 1;
        const dmg = d1 + d2 + d3;
        
        const sourceName = source === 'player' ? (state.ship.name || 'OPERATIVE SHIP') : 'ENEMY CONTACT';
        const targetName = source === 'player' ? 'ENEMY' : (state.ship.name || 'OPERATIVE SHIP');
        
        const msg = `⚔️ COMBAT ENGAGEMENT: ${sourceName} attacks ${targetName}! [d20: ${d20}] >> DMG: ${dmg} (${d1}+${d2}+${d3})`;
        const color = source === 'player' ? '#3b82f6' : '#ef4444';
        
        firebaseSync('shared/broadcast', { message: msg, timestamp: Date.now(), alertColor: color });
    }

    window.triggerSystemEvent = function(eventId) {
        let msg = "";
        let color = "#f97316"; // orange
        if (eventId === 'hyperspace_drop') msg = "SYSTEM OVERRIDE: Emergency Hyperspace Drop Initiated!";
        if (eventId === 'emp_blast') { msg = "CRITICAL: Electromagnetic Pulse Detected. Systems offline."; color = "#3b82f6"; }
        if (eventId === 'comms_blackout') { msg = "WARNING: Long-range communications severed."; color = "#a855f7"; }
        if (eventId === 'gravity_loss') { msg = "ALERT: Artificial gravity generators failing."; color = "#facc15"; }
        
        firebaseSync('shared/broadcast', { message: msg, timestamp: Date.now(), alertColor: color });
    }

    function triggerShipAlert(alertId) {
        const alert = SHIP_ALERTS.find(a => a.id === alertId);
        if (!alert) return;
        playAlertSound(alert);
        const d20 = Math.floor(Math.random() * 20) + 1;
        const showRoll = document.getElementById('dm-show-roll');
        const rollStr = (showRoll && showRoll.checked) ? ` [🎲 d20: ${d20}]` : '';
                const msg = `⚠ SHIP ALERT: ${alert.name.toUpperCase()} — ${alert.desc.toUpperCase()}${rollStr}`;
        firebaseSync('shared/broadcast', { message: msg, timestamp: Date.now(), alertColor: alert.colorHex });
    }

    // --- DM RESET FUNCTIONS ---
    function dmResetPlayer(slot) {
        if (!confirm(`PURGE all data for ${slot}? This will wipe their character, stats, and equipment. This CANNOT be undone.`)) return;
        const blank = { name: "New Operative", cls: "None", level: 1, hp: {current: 10, max: 10}, ac: 10, speed: 30, credits: 0, stats: {str:10,dex:10,con:10,int:10,wis:10,cha:10} };
        firebaseSync('characters/' + slot, blank);
        partyData[slot] = blank;
        if (state.activeSlot === slot) {
            state.name = blank.name; state.cls = blank.cls; state.level = blank.level;
            state.hp = {...blank.hp}; state.ac = blank.ac; state.speed = blank.speed;
            state.credits = blank.credits; state.stats = {...blank.stats};
            state.customTitle = ''; state.favorites = {armory:[], spells:[]};
            state.proficiencies = {saves:[], skills:{}};
            saveState(); loadSettingsUI(); renderCharacterSheet();
        }
        renderDM(); renderParty();
    }

    function dmResetShip() {
        if (!confirm('PURGE all ship data? Hull, shields, stations, and location will be reset. This CANNOT be undone.')) return;
        const freshShip = { 
            name:"The Vanguard", 
            type:"freighter", 
            hullMax:100, hullCur:100, 
            shieldsMax:50, shieldsCur:50,
            stations:{helm:null,gunnery:null,engineering:null}, 
            location:"Coruscant" 
        };
        state.ship = freshShip;
        saveState();
        firebaseSync('shared/ship', freshShip);
        renderShip(); renderDM();
    }

    function dmResetAll() {
        if (!confirm('⚠ TOTAL SYSTEM PURGE ⚠\n\nThis will wipe ALL player data, ship data, bounties, and custom content across the ENTIRE application.\n\nAre you ABSOLUTELY sure?')) return;
        if (!confirm('FINAL CONFIRMATION: Type OK below to proceed with total purge.')) return;
        ['slot1','slot2','slot3'].forEach(slot => {
            const blank = { name: "New Operative", cls: "None", level: 1, hp: {current: 10, max: 10}, ac: 10, speed: 30, credits: 0, stats: {str:10,dex:10,con:10,int:10,wis:10,cha:10} };
            firebaseSync('characters/' + slot, blank);
            partyData[slot] = blank;
        });
        dmResetShip();
        state.bountiesStatus = {};
        state.customBounties = [];
        firebaseSync('shared/bounties', {}); db.ref('shared/customBounties').set([]);
        saveState(); renderDM(); renderParty(); renderBounties();
        alert('System purge complete. All operatives reset.');
    }

    // --- DM MODE LOGIC ---
    function promptDMMode() {
        if (state.isDM) {
            closeSettingsModal();
            switchMainTab('dm');
            renderDM();
            return;
        }
        const pass = prompt("Enter Protocol Override Code:");
        if (pass === "ORGY") {
            state.isDM = true;
            saveState();
            const dmBtn = document.getElementById('nav-dm');
            if (dmBtn) dmBtn.classList.remove('hidden');
            closeSettingsModal();
            switchMainTab('dm');
            renderDM();
        } else if (pass !== null) {
            alert("Access Denied.");
        }
    }

    function switchDMTab(tabId) {
        document.querySelectorAll('.dm-sub-tab').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.dm-tab-btn').forEach(el => el.classList.remove('active'));
        
        document.getElementById(`dm-tab-${tabId}`).classList.remove('hidden');
        document.getElementById(`dm-nav-${tabId}`).classList.add('active');
        
        if (tabId === 'telemetry') renderDMTelemetry();
    }

    async function rollDMDice(sides) {
        const hud = document.getElementById('dice-hud');
        const resEl = document.getElementById('dice-result');
        if (!hud || !resEl) return;
        
        document.getElementById('dice-label').innerText = `DM Roll: D${sides}`;
        document.getElementById('dice-mod').innerText = '--';
        
        hud.classList.add('active');
        resEl.classList.remove('dice-crit', 'dice-fail');
        resEl.innerText = '--';

        try {
            const logRef = db.ref('shared/gamelog').push();
            logRef.set({ name: "The Force (DM)", label: `D${sides} Roll`, mod: 0, result: 0, timestamp: Date.now() });

            let currentRoll = 1;
            const interval = setInterval(() => {
                currentRoll = Math.floor(Math.random() * sides) + 1;
                resEl.innerText = currentRoll;
            }, 50);

            setTimeout(() => {
                clearInterval(interval);
                const roll = Math.floor(Math.random() * sides) + 1;
                logRef.update({ result: roll });
                if(roll === sides) resEl.classList.add('dice-crit', 'glow-text-hud');
                if(roll === 1) resEl.classList.add('dice-fail');
                resEl.innerText = roll;
                setTimeout(() => closeDiceHUD(), 2000);
            }, 800);
        } catch(e) {
            resEl.innerText = Math.floor(Math.random() * sides) + 1;
            setTimeout(() => closeDiceHUD(), 2000);
        }
    }

    function renderDMTelemetry() {
        const container = document.getElementById('dm-telemetry-container');
        if (!container) return;
        
        let html = '';
        Object.entries(partyData).forEach(([slotId, data]) => {
            if (!data || slotId === 'slot4') return;
            const hpCur = (data.hp && data.hp.current) || 0;
            const hpMax = (data.hp && data.hp.max) || 1;
            const hpPct = Math.min(100, Math.max(0, (hpCur / hpMax) * 100));
            const hpColor = hpPct < 30 ? 'bg-red-500' : hpPct < 60 ? 'bg-amber-500' : 'bg-emerald-500';
            
            html += `
                <div class="bg-slate-950/60 border border-slate-800 rounded p-4 relative overflow-hidden group transition-all hover:border-red-900/40">
                    <div class="absolute inset-0 opacity-[0.03] pointer-events-none" style="background-image: radial-gradient(circle at 2px 2px, #fff 1px, transparent 0); background-size: 16px 16px;"></div>
                    <div class="absolute top-0 left-0 w-1 h-full bg-red-900 shadow-[0_0_10px_rgba(153,27,27,0.5)]"></div>
                    <div class="flex justify-between items-start mb-3 relative">
                        <div>
                            <h4 class="text-white font-bold text-base uppercase display-font tracking-wide">${data.name}</h4>
                            <p class="text-[10px] text-red-500/70 uppercase datapad-font tracking-widest font-bold">Operative Signal: ${slotId.toUpperCase()}</p>
                        </div>
                        <div class="text-right">
                            <div class="text-[9px] text-slate-500 uppercase font-bold mb-1">Combat Rating</div>
                            <span class="text-xs font-mono text-slate-200 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">AC: ${data.ac}</span>
                        </div>
                    </div>
                    
                    <div class="mb-4 relative">
                        <div class="flex justify-between text-[9px] uppercase font-bold text-slate-500 mb-1.5">
                            <span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full ${hpPct < 30 ? 'bg-red-500 animate-ping' : 'bg-emerald-500'}"></span> Bio-Vitals Scan</span>
                            <span class="${hpCur < hpMax * 0.3 ? 'text-red-500 animate-pulse font-black' : 'text-slate-300'} font-mono">${hpCur} / ${hpMax} HP</span>
                        </div>
                        <div class="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-[1px]">
                            <div class="h-full ${hpColor} transition-all duration-700 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)]" style="width: ${hpPct}%"></div>
                        </div>
                    </div>

                    <div class="grid grid-cols-6 gap-1.5 relative mb-4">
                        ${['str', 'dex', 'con', 'int', 'wis', 'cha'].map(s => `
                            <div class="bg-slate-950 border border-slate-800/80 p-1.5 rounded flex flex-col items-center">
                                <div class="text-[7px] text-slate-600 uppercase font-black tracking-tighter mb-0.5">${s}</div>
                                <div class="text-[11px] text-slate-100 font-mono font-bold">${data.stats[s]}</div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="border-t border-slate-800 pt-3 mt-1 flex justify-between items-center relative">
                        <div class="text-[8px] text-slate-600 uppercase font-bold">Administrative Override</div>
                        <div class="flex gap-2">
                            ${state.activeSlot !== 'slot4' ? `<button onclick="releaseControl()" class="bg-blue-950/40 border border-blue-900 text-blue-400 px-3 py-1 rounded text-[9px] uppercase font-bold hover:bg-blue-900 transition-colors">Release Control</button>` : ''}
                            <button onclick="inspectOperative('${slotId}')" class="bg-slate-800 border border-slate-700 text-slate-300 px-3 py-1 rounded text-[9px] uppercase font-bold hover:bg-slate-700 transition-colors">Inspect</button>
                            <button onclick="assumeControl('${slotId}')" class="bg-red-950/40 border border-red-900 text-red-500 px-3 py-1 rounded text-[9px] uppercase font-bold hover:bg-red-900 transition-colors">Assume Control</button>
                        </div>
                    </div>
                </div>
            `;
        });

        if (html === '') {
            html = '<div class="text-slate-600 text-center py-10 uppercase datapad-font text-xs tracking-widest">No active life signs detected in squad frequency.</div>';
        }
        
        container.innerHTML = html;
    }

    function inspectOperative(slotId) {
        const data = partyData[slotId];
        if (!data) return;
        
        const modal = document.getElementById('inspect-modal');
        const nameEl = document.getElementById('inspect-name');
        const slotEl = document.getElementById('inspect-slot');
        const contentEl = document.getElementById('inspect-content');
        
        if (!modal || !contentEl) return;
        
        nameEl.innerText = data.name;
        slotEl.innerText = `Deep Scan Transmission: ${slotId.toUpperCase()}`;
        
        let html = `
            <div class="grid grid-cols-3 gap-6">
                <!-- Vitals Column -->
                <div class="space-y-6">
                    <div class="bg-slate-900 border border-slate-800 p-4 rounded">
                        <h4 class="text-hud text-[10px] font-bold uppercase tracking-widest mb-3 border-b border-hud/20 pb-1">Vital Statistics</h4>
                        <div class="space-y-3">
                            <div class="flex justify-between items-center">
                                <span class="text-[9px] text-slate-500 uppercase font-bold">Class</span>
                                <input type="text" value="${data.cls}" onchange="updateDMCharField('${slotId}', 'cls', null, this.value)" class="bg-slate-950 border border-slate-800 text-white font-bold uppercase text-[10px] w-1/2 text-right px-1 rounded">
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-[9px] text-slate-500 uppercase font-bold">Lvl</span>
                                <input type="number" value="${data.level}" onchange="updateDMCharField('${slotId}', 'level', null, this.value)" class="bg-slate-950 border border-slate-800 text-white font-bold text-[10px] w-1/4 text-right px-1 rounded">
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-[9px] text-slate-500 uppercase font-bold">HP Current</span>
                                <input type="number" value="${data.hp.current}" onchange="updateDMCharField('${slotId}', 'hp', 'current', this.value)" class="bg-slate-950 border border-slate-800 text-emerald-400 font-bold text-[10px] w-1/4 text-right px-1 rounded">
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-[9px] text-slate-500 uppercase font-bold">HP Max</span>
                                <input type="number" value="${data.hp.max}" onchange="updateDMCharField('${slotId}', 'hp', 'max', this.value)" class="bg-slate-950 border border-slate-800 text-emerald-900 font-bold text-[10px] w-1/4 text-right px-1 rounded">
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-[9px] text-slate-500 uppercase font-bold">Armor Class</span>
                                <input type="number" value="${data.ac}" onchange="updateDMCharField('${slotId}', 'ac', null, this.value)" class="bg-slate-950 border border-slate-800 text-white font-mono text-[10px] w-1/4 text-right px-1 rounded">
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-[9px] text-slate-500 uppercase font-bold">Speed (ft)</span>
                                <input type="number" value="${data.speed}" onchange="updateDMCharField('${slotId}', 'speed', null, this.value)" class="bg-slate-950 border border-slate-800 text-white font-mono text-[10px] w-1/4 text-right px-1 rounded">
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-slate-900 border border-slate-800 p-4 rounded">
                        <h4 class="text-hud text-[10px] font-bold uppercase tracking-widest mb-3 border-b border-hud/20 pb-1">Resources</h4>
                        <div class="space-y-2">
                            ${(data.resources || []).map((r, i) => `
                                <div class="bg-slate-950 p-2 rounded border border-slate-800 space-y-2">
                                    <input type="text" value="${r.name}" onchange="updateDMResource('${slotId}', ${i}, 'name', this.value)" class="bg-transparent border-none text-[9px] text-slate-400 uppercase font-bold w-full focus:ring-0 p-0">
                                    <div class="flex justify-between items-center">
                                        <div class="flex gap-1 items-center">
                                            <input type="number" value="${r.current}" onchange="updateDMResource('${slotId}', ${i}, 'current', this.value)" class="bg-slate-900 border border-slate-800 text-[10px] text-emerald-400 font-mono w-10 text-center rounded px-1">
                                            <span class="text-slate-600">/</span>
                                            <input type="number" value="${r.max}" onchange="updateDMResource('${slotId}', ${i}, 'max', this.value)" class="bg-slate-900 border border-slate-800 text-[10px] text-emerald-900 font-mono w-10 text-center rounded px-1">
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                            <div class="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-800">
                                <span class="text-[9px] text-slate-400 uppercase font-bold">Credits</span>
                                <input type="number" value="${data.credits || 0}" onchange="updateDMCharField('${slotId}', 'credits', null, this.value)" class="bg-transparent border-none text-right text-amber-400 font-mono text-[10px] w-1/2 focus:ring-0 p-0">
                            </div>
                            <button onclick="addDMResource('${slotId}')" class="w-full bg-slate-800 hover:bg-slate-700 text-slate-400 text-[9px] py-1.5 rounded uppercase font-bold border border-slate-700 mt-2 transition-colors">+ Add Resource Pool</button>
                        </div>
                    </div>
                </div>
                
                <!-- Inventory Column -->
                <div class="col-span-2 space-y-6">
                    <div class="bg-slate-900 border border-slate-800 p-4 rounded h-full">
                        <h4 class="text-hud text-[10px] font-bold uppercase tracking-widest mb-4 border-b border-hud/20 pb-1">Armory & Equipment</h4>
                        <div class="grid grid-cols-2 gap-2">
                            ${(data.armory || []).length > 0 ? data.armory.map(i => `
                                <div class="bg-slate-950 border border-slate-800 p-2 rounded flex items-center gap-3">
                                    <div class="w-8 h-8 bg-slate-900 rounded border border-slate-800 flex items-center justify-center text-lg">${i.icon || '📦'}</div>
                                    <div class="flex-1 min-w-0">
                                        <div class="text-[10px] text-white font-bold uppercase truncate">${i.name}</div>
                                        <div class="text-[8px] text-slate-500 uppercase">${i.type || 'Gear'}</div>
                                    </div>
                                </div>
                            `).join('') : '<div class="col-span-2 py-10 text-center text-slate-600 uppercase text-[10px] tracking-widest">No gear detected in local frequency.</div>'}
                        </div>
                        
                        <h4 class="text-hud text-[10px] font-bold uppercase tracking-widest mb-4 mt-8 border-b border-hud/20 pb-1">Special Features & Traits</h4>
                        <div class="space-y-2">
                            ${(data.features || []).length > 0 ? data.features.map(f => `
                                <div class="bg-slate-950/50 border border-slate-800/50 p-3 rounded">
                                    <div class="text-[10px] text-blue-400 font-bold uppercase mb-1">${f.name}</div>
                                    <div class="text-[9px] text-slate-400 leading-tight">${f.desc || 'No description available.'}</div>
                                </div>
                            `).join('') : ''}
                            
                            <!-- Custom Feats -->
                            ${(data.feats || []).map((feat, idx) => `
                                <div class="bg-slate-900 border border-slate-800 p-3 rounded relative group">
                                    <span class="text-[9px] font-bold uppercase tracking-widest text-indigo-400 block mb-1">Custom Feat / Specialty</span>
                                    <p class="text-[10px] text-slate-100">${feat}</p>
                                    <button onclick="removeDMFeat('${slotId}', ${idx})" class="absolute top-2 right-2 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                    </button>
                                </div>
                            `).join('')}
                            
                            <button onclick="addDMFeat('${slotId}')" class="w-full bg-slate-800 hover:bg-slate-700 text-slate-400 text-[9px] py-1.5 rounded uppercase font-bold border border-slate-700 mt-2 transition-colors">+ Grant New Feat</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        contentEl.innerHTML = html;
        modal.classList.remove('hidden');
    }

    function closeInspect() {
        document.getElementById('inspect-modal').classList.add('hidden');
    }

    function exitDMMode() {
        state.isDM = false;
        saveState();
        switchMainTab('character');
    }

    function releaseControl() {
        state.activeSlot = 'slot4';
        saveState();
        switchMainTab('dm');
        renderDM();
        showHolonetAlert("Administrative Access Restored", "border-blue-900 bg-blue-950/50");
    }

    function assumeControl(slotId) {
        state.activeSlot = slotId;
        saveState();
        switchMainTab('character');
        showHolonetAlert(`Administrative Override: Controlling ${slotId.toUpperCase()}`, 'border-red-900 bg-red-950/50');
    }
    function updateDMCharField(slot, field, subfield, value) {
        if(!partyData[slot]) return;
        if(subfield) {
            partyData[slot][field][subfield] = isNaN(value) ? value : parseInt(value);
        } else {
            partyData[slot][field] = isNaN(value) ? value : parseInt(value);
        }
        firebaseSync('characters/' + slot, partyData[slot]);
    }

    function updateDMResource(slot, resIdx, field, value) {
        if(!partyData[slot] || !partyData[slot].resources[resIdx]) return;
        const res = partyData[slot].resources[resIdx];
        if(field === 'name') res.name = value;
        else res[field] = parseInt(value);
        firebaseSync('characters/' + slot, partyData[slot]);
    }

    function addDMResource(slotId) {
        if(!partyData[slotId]) return;
        if(!partyData[slotId].resources) partyData[slotId].resources = [];
        partyData[slotId].resources.push({ name: "NEW RESOURCE", current: 0, max: 0 });
        firebaseSync('characters/' + slotId, partyData[slotId]);
        inspectOperative(slotId); // Refresh modal
    }

    function addDMFeat(slotId) {
        if(!partyData[slotId]) return;
        const f = prompt("Enter Feat Name or Custom Specialty to grant:");
        if (f) {
            if(!partyData[slotId].feats) partyData[slotId].feats = [];
            partyData[slotId].feats.push(f);
            firebaseSync('characters/' + slotId, partyData[slotId]);
            inspectOperative(slotId);
        }
    function removeDMFeat(slotId, idx) {
        if(!partyData[slotId] || !partyData[slotId].feats) return;
        partyData[slotId].feats.splice(idx, 1);
        firebaseSync('characters/' + slotId, partyData[slotId]);
        inspectOperative(slotId);
    }

    function renderDM() {
        const c = document.getElementById('dm-controls-container');
        if (!c) return;
        
        // Ensure other DM components are rendered initially
        renderDMTelemetry();
        renderDMVesselStatus();
        renderDMEnemies();

        c.innerHTML = `
            <div class="space-y-6">
                <!-- Global Alerts -->
                <div>
                    <h4 class="text-red-400 font-bold uppercase tracking-widest text-[10px] mb-3 border-b border-red-900/50 pb-1 flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
                        Global Ship Directives
                        <div class="flex items-center gap-2 ml-auto">
                            <input type="checkbox" id="dm-show-roll" class="w-3 h-3 accent-red-600 rounded" checked>
                            <label for="dm-show-roll" class="text-[8px] text-slate-500 uppercase font-bold">Show Roll</label>
                        </div>
                    </h4>
                    <div class="grid grid-cols-3 gap-2">
                        ${SHIP_ALERTS.map(a => `
                            <button onclick="triggerShipAlert('${a.id}')" class="border rounded p-2 text-center transition-all hover:scale-105 active:scale-95 ${a.color}">
                                <span class="text-xl block mb-1">${a.icon}</span>
                                <span class="text-[9px] font-bold uppercase tracking-widest datapad-font block">${a.name}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>

                <!-- Holonet Broadcast -->
                <div>
                    <h4 class="text-red-400 font-bold uppercase tracking-widest text-[10px] mb-3 border-b border-red-900/50 pb-1">Holonet Broadcast</h4>
                    <div class="flex gap-2">
                        <input type="text" id="dm-broadcast-input" placeholder="ENTER CRITICAL ALERT..." class="flex-1 bg-slate-950 border border-red-900/30 rounded px-3 py-2 text-red-500 font-bold datapad-font focus:outline-none focus:border-red-500 uppercase text-xs">
                        <button onclick="sendBroadcast()" class="bg-red-900 hover:bg-red-800 text-white px-4 py-2 rounded font-bold uppercase tracking-widest datapad-font text-[10px]">Send</button>
                    </div>
                </div>

                <!-- Combat Orchestration -->
                <div>
                    <h4 class="text-red-500 font-bold uppercase tracking-widest text-[10px] mb-3 border-b border-red-900/50 pb-1 flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                        Combat Orchestration
                    </h4>
                    <div class="grid grid-cols-2 gap-2 mb-4">
                        <button onclick="triggerShipCombatRoll('player')" class="bg-blue-950/20 border border-blue-900/50 text-blue-400 hover:bg-blue-900/40 px-3 py-2 rounded text-[9px] uppercase font-bold tracking-widest datapad-font">Ship Attack Roll</button>
                        <button onclick="triggerShipCombatRoll('enemy')" class="bg-red-950/20 border border-red-900/50 text-red-400 hover:bg-red-900/40 px-3 py-2 rounded text-[9px] uppercase font-bold tracking-widest datapad-font">Enemy Attack Roll</button>
                    </div>
                </div>

                <!-- Ship's Log -->
                <div>
                    <h4 class="text-hud font-bold uppercase tracking-widest text-[10px] mb-3 border-b border-hud/30 pb-1">Ship's Log Transmission</h4>
                    <textarea id="dm-shiplog-input" placeholder="ENTER LOG ENTRY DATA..." class="w-full h-24 bg-slate-950 border border-hud/20 rounded p-3 text-hud font-mono text-xs focus:outline-none focus:border-hud mb-2 custom-scrollbar uppercase"></textarea>
                    <div class="flex gap-2">
                        <button onclick="sendShipLog('all')" class="flex-1 bg-hud/10 hover:bg-hud/20 text-hud border border-hud/30 px-3 py-1.5 rounded text-[9px] uppercase font-bold tracking-widest datapad-font">Show All</button>
                        <button onclick="sendShipLog('scroll')" class="flex-1 bg-indigo-950/20 hover:bg-indigo-900/40 text-indigo-400 border border-indigo-900/30 px-3 py-1.5 rounded text-[9px] uppercase font-bold tracking-widest datapad-font">Scroll</button>
                    </div>
                </div>

                <!-- System Events -->
                <div>
                    <h4 class="text-orange-400 font-bold uppercase tracking-widest text-[10px] mb-3 border-b border-orange-900/50 pb-1">Environmental & System Overrides</h4>
                    <div class="grid grid-cols-2 gap-2">
                        <button onclick="triggerSystemEvent('hyperspace_drop')" class="bg-orange-950/20 border border-orange-900/50 text-orange-400 hover:bg-orange-900/40 px-3 py-2 rounded text-[9px] uppercase font-bold tracking-widest datapad-font">Emergency Hyper-Drop</button>
                        <button onclick="triggerSystemEvent('emp_blast')" class="bg-blue-950/20 border border-blue-900/50 text-blue-400 hover:bg-blue-900/40 px-3 py-2 rounded text-[9px] uppercase font-bold tracking-widest datapad-font">EMP Blast</button>
                        <button onclick="triggerSystemEvent('comms_blackout')" class="bg-purple-950/20 border border-purple-900/50 text-purple-400 hover:bg-purple-900/40 px-3 py-2 rounded text-[9px] uppercase font-bold tracking-widest datapad-font">Comms Blackout</button>
                        <button onclick="triggerSystemEvent('gravity_loss')" class="bg-yellow-950/20 border border-yellow-900/50 text-yellow-400 hover:bg-yellow-900/40 px-3 py-2 rounded text-[9px] uppercase font-bold tracking-widest datapad-font">Zero Gravity Loss</button>
                    </div>
                </div>

                <!-- Danger Zone -->
                <div class="pt-4 border-t border-red-900/30">
                    <h4 class="text-red-600 font-black uppercase tracking-tighter text-[10px] mb-3 flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path></svg>
                        Administrative Purge
                    </h4>
                    <div class="grid grid-cols-2 gap-2">
                        <button onclick="dmResetShip()" class="border border-red-900/50 text-red-500 hover:bg-red-950/30 text-[9px] py-2 rounded uppercase font-bold tracking-widest datapad-font">Reset Ship</button>
                        <button onclick="dmResetAll()" class="bg-red-950/50 border border-red-900 text-red-400 hover:bg-red-900 text-[9px] py-2 rounded uppercase font-bold tracking-widest datapad-font">Reset All</button>
                    </div>
                </div>
            </div>
        `;
    }

    function renderDMVesselStatus() {
        const container = document.getElementById('dm-vessel-status-container');
        if (!container) return;
        
        container.innerHTML = `
            <div class="bg-slate-950/60 border border-slate-800 p-4 rounded-lg mb-6 relative overflow-hidden">
                <div class="absolute inset-0 bg-blue-500/5 pointer-events-none"></div>
                <h4 class="text-blue-400 font-bold uppercase tracking-widest text-[10px] mb-3 border-b border-blue-900/30 pb-1 flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    Operative Vessel Status
                </h4>
                
                <div class="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <label class="text-[9px] text-slate-500 uppercase block mb-1">Designation</label>
                        <input type="text" value="${state.ship ? (state.ship.name||'') : ''}" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-bold datapad-font text-xs" onchange="if(state.ship) { state.ship.name=this.value; saveState(); firebaseSync('shared/ship', state.ship); renderShip(); renderDMVesselStatus(); }">
                    </div>
                    <div>
                        <label class="text-[9px] text-indigo-400 uppercase font-bold block mb-1">System Override</label>
                        <select class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-bold datapad-font text-xs" onchange="if(state.ship) { state.ship.location=this.value; saveState(); firebaseSync('shared/ship', state.ship); renderShip(); renderNaviComputer(); renderDMVesselStatus(); }">
                            ${planetData.map(p => `<option value="${p.name}" ${state.ship.location===p.name?'selected':''}>${p.name}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4 border-t border-slate-800 pt-4">
                    <div>
                        <label class="text-[9px] text-emerald-500 uppercase font-bold block mb-1">Hull Integrity</label>
                        <div class="flex gap-2 mb-1">
                            <input type="number" value="${(state.ship && state.ship.hullCur !== undefined) ? state.ship.hullCur : 100}" class="w-1/2 bg-slate-900 border border-slate-700 rounded px-1 py-1 text-emerald-400 font-mono text-center text-xs" onchange="if(state.ship) { state.ship.hullCur=parseInt(this.value); saveState(); firebaseSync('shared/ship', state.ship); renderShip(); renderDMVesselStatus(); }">
                            <input type="number" value="${(state.ship && state.ship.hullMax !== undefined) ? state.ship.hullMax : 100}" class="w-1/2 bg-slate-900 border border-slate-700 rounded px-1 py-1 text-emerald-800 font-mono text-center text-xs" onchange="if(state.ship) { state.ship.hullMax=parseInt(this.value); saveState(); firebaseSync('shared/ship', state.ship); renderShip(); renderDMVesselStatus(); }">
                        </div>
                        <div class="flex gap-1">
                            <button onclick="dmModifyShip('hull', -10)" class="flex-1 bg-red-950/50 border border-red-900 text-red-500 text-[10px] font-bold rounded py-0.5 hover:bg-red-900 hover:text-white transition-colors">-10</button>
                            <button onclick="dmModifyShip('hull', 10)" class="flex-1 bg-emerald-950/50 border border-emerald-900 text-emerald-500 text-[10px] font-bold rounded py-0.5 hover:bg-emerald-900 hover:text-white transition-colors">+10</button>
                        </div>
                    </div>
                    <div>
                        <label class="text-[9px] text-blue-400 uppercase font-bold block mb-1">Shield Energy</label>
                        <div class="flex gap-2 mb-1">
                            <input type="number" value="${(state.ship && state.ship.shieldsCur !== undefined) ? state.ship.shieldsCur : 50}" class="w-1/2 bg-slate-900 border border-slate-700 rounded px-1 py-1 text-blue-400 font-mono text-center text-xs" onchange="if(state.ship) { state.ship.shieldsCur=parseInt(this.value); saveState(); firebaseSync('shared/ship', state.ship); renderShip(); renderDMVesselStatus(); }">
                            <input type="number" value="${(state.ship && state.ship.shieldsMax !== undefined) ? state.ship.shieldsMax : 50}" class="w-1/2 bg-slate-900 border border-slate-700 rounded px-1 py-1 text-blue-900 font-mono text-center text-xs" onchange="if(state.ship) { state.ship.shieldsMax=parseInt(this.value); saveState(); firebaseSync('shared/ship', state.ship); renderShip(); renderDMVesselStatus(); }">
                        </div>
                        <div class="flex gap-1">
                            <button onclick="dmModifyShip('shields', -10)" class="flex-1 bg-red-950/50 border border-red-900 text-red-500 text-[10px] font-bold rounded py-0.5 hover:bg-red-900 hover:text-white transition-colors">-10</button>
                            <button onclick="dmModifyShip('shields', 10)" class="flex-1 bg-blue-950/50 border border-blue-900 text-blue-500 text-[10px] font-bold rounded py-0.5 hover:bg-blue-900 hover:text-white transition-colors">+10</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    

    // --- DM SHIP MODIFIER ---
    window.dmModifyShip = function(type, amount) {
        if (!state.ship) return;
        if (type === 'hull') {
            state.ship.hullCur = Math.max(0, Math.min(state.ship.hullMax, state.ship.hullCur + amount));
        } else if (type === 'shields') {
            state.ship.shieldsCur = Math.max(0, Math.min(state.ship.shieldsMax, state.ship.shieldsCur + amount));
        }
        saveState();
        firebaseSync('shared/ship', state.ship);
        renderShip();
        renderDMVesselStatus();
        
        // Also send an alert if taking damage
        if (amount < 0) {
            let msg = type === 'hull' ? "Hull Breach Detected! Integrity Compromised." : "Shields Taking Heavy Fire!";
            firebaseSync('shared/broadcast', { message: msg, timestamp: Date.now(), alertColor: '#ef4444' });
        }
    }

    function renderDMEnemies() {
        const container = document.getElementById('dm-enemies-container');
        if (!container) return;
        
        container.innerHTML = (state.enemies || []).map((e, i) => `
            <div class="bg-slate-900 border border-red-900/40 rounded p-4 space-y-4 relative overflow-hidden group">
                <div class="absolute inset-0 bg-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                <div class="flex justify-between items-center border-b border-red-900/20 pb-2 relative">
                    <input type="text" value="${e.name}" onchange="updateEnemy(${i}, 'name', this.value)" class="bg-transparent text-white font-bold uppercase display-font border-none focus:ring-0 w-2/3 text-xs">
                    <button onclick="removeEnemy(${i})" class="text-red-500 text-[9px] uppercase font-bold hover:text-red-400 transition-colors">Purge</button>
                </div>
                
                <div class="grid grid-cols-2 gap-4 relative">
                    <div>
                        <label class="text-[8px] text-slate-500 uppercase block mb-1">Affiliation</label>
                        <select onchange="updateEnemy(${i}, 'affiliation', this.value)" class="w-full bg-slate-950 border border-slate-800 text-[10px] text-white p-1 rounded">
                            <option value="Imperial" ${e.affiliation==='Imperial'?'selected':''}>Imperial</option>
                            <option value="Pirate" ${e.affiliation==='Pirate'?'selected':''}>Pirate</option>
                            <option value="Civilian" ${e.affiliation==='Civilian'?'selected':''}>Civilian</option>
                            <option value="Unknown" ${e.affiliation==='Unknown'?'selected':''}>Unknown</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-[8px] text-slate-500 uppercase block mb-1">Class Signature</label>
                        <select onchange="updateEnemy(${i}, 'class', this.value)" class="w-full bg-slate-950 border border-slate-800 text-[10px] text-white p-1 rounded">
                            <option value="Fighter" ${e.class==='Fighter'?'selected':''}>Fighter</option>
                            <option value="Freighter" ${e.class==='Freighter'?'selected':''}>Freighter</option>
                            <option value="Destroyer" ${e.class==='Destroyer'?'selected':''}>Destroyer</option>
                        </select>
                    </div>
                </div>

                <div class="relative">
                    <label class="text-[8px] text-red-400 uppercase block mb-2 font-bold">Detection Range: Stage ${e.stage}</label>
                    <input type="range" min="1" max="3" step="1" value="${e.stage}" oninput="updateEnemy(${i}, 'stage', parseInt(this.value))" class="w-full accent-red-600">
                    <div class="flex justify-between text-[7px] text-slate-600 mt-1 uppercase font-bold">
                        <span>Ghost</span>
                        <span>Lock</span>
                        <span>Tactical</span>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4 relative pt-2 border-t border-slate-800">
                    <div>
                        <label class="text-[8px] text-slate-500 uppercase block mb-1">Hull Integrity</label>
                        <div class="flex gap-2">
                            <input type="number" value="${e.hpCur}" onchange="updateEnemy(${i}, 'hpCur', parseInt(this.value))" class="w-1/2 bg-slate-950 border border-slate-800 text-[10px] text-emerald-400 p-1 rounded font-mono text-center">
                            <input type="number" value="${e.hpMax}" onchange="updateEnemy(${i}, 'hpMax', parseInt(this.value))" class="w-1/2 bg-slate-950 border border-slate-800 text-[10px] text-emerald-900 p-1 rounded font-mono text-center">
                        </div>
                    </div>
                    <div>
                        <label class="text-[8px] text-slate-500 uppercase block mb-1">Shield Energy</label>
                        <div class="flex gap-2">
                            <input type="number" value="${e.shCur}" onchange="updateEnemy(${i}, 'shCur', parseInt(this.value))" class="w-1/2 bg-slate-950 border border-slate-800 text-[10px] text-blue-400 p-1 rounded font-mono text-center">
                            <input type="number" value="${e.shMax}" onchange="updateEnemy(${i}, 'shMax', parseInt(this.value))" class="w-1/2 bg-slate-950 border border-slate-800 text-[10px] text-blue-900 p-1 rounded font-mono text-center">
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    function updateEnemy(idx, field, val) {
        if (!state.enemies[idx]) return;
        state.enemies[idx][field] = val;
        saveState();
        firebaseSync('shared/enemies', state.enemies);
        renderShip();
        renderDMEnemies();
    }

    function removeEnemy(idx) {
        if (!Array.isArray(state.enemies)) {
            // If it's an object (happens sometimes with Firebase indices), convert it
            state.enemies = Object.values(state.enemies || {});
        }
        state.enemies.splice(idx, 1);
        saveState();
        firebaseSync('shared/enemies', state.enemies);
        renderShip();
        renderDMEnemies();
    }

    function addEnemyShip() {
        if (!state.enemies) state.enemies = [];
        if (state.enemies.length >= 3) return;
        const newEnemy = {
            name: "Unknown Contact",
            class: "Fighter",
            affiliation: "Imperial",
            stage: 1,
            hpMax: 30, hpCur: 30,
            shMax: 20, shCur: 20,
            ac: 14,
            visible: true
        };
        state.enemies.push(newEnemy);
        saveState();
        firebaseSync('shared/enemies', state.enemies);
        renderShip();
        renderDMEnemies();
    }

    // --- PARTY ROSTER LOGIC ---
    function renderParty() {
        const c = document.getElementById('party-container');
        if (!c) return;
        
        let html = '';
        // Iterate through all slots in partyData, excluding self and DM
        Object.keys(partyData).sort().forEach(slot => {
            if (slot === state.activeSlot || slot === 'slot4') return;
            const data = partyData[slot];
            if (!data) {
                html += `<div class="data-card p-4 text-center opacity-50"><span class="text-xs uppercase datapad-font text-slate-500">No Telemetry for ${slot}</span></div>`;
                return;
            }
            
            const hpCur = data.hp ? data.hp.current : 0;
            const hpMax = data.hp ? data.hp.max : 0;
            const hpPct = hpMax > 0 ? (hpCur / hpMax) * 100 : 0;
            let hpColor = "bg-emerald-500";
            if (hpPct < 50) hpColor = "bg-amber-500";
            if (hpPct < 25) hpColor = "bg-red-500";
            
            html += `
            <div class="data-card p-5 border-l-4" style="border-color: ${hpPct < 25 ? '#ef4444' : (hpPct < 50 ? '#f59e0b' : 'var(--hud)')}">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h3 class="text-xl font-black leading-tight display-font glow-text-hud text-white uppercase tracking-tighter">${escapeHtml(data.name)}</h3>
                        <span class="datapad-font text-[10px] uppercase tracking-widest mt-1 block" style="color: var(--accent);">${data.customTitle ? escapeHtml(data.customTitle) + ' — ' : ''}${escapeHtml(data.cls)} // Lvl ${data.level || 1}</span>
                    </div>
                    <div class="text-right">
                        <span class="text-[10px] text-slate-500 uppercase datapad-font block">Operative Status</span>
                        <span class="text-xs font-bold ${hpPct > 0 ? 'text-emerald-400' : 'text-red-500'} uppercase datapad-font">${hpPct > 0 ? 'Active' : 'Incapacitated'}</span>
                    </div>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- LEFT COLUMN: VITALS & RESOURCES -->
                    <div>
                        <div class="mb-4">
                            <div class="flex justify-between text-[10px] text-slate-400 font-mono mb-1 uppercase tracking-widest">
                                <span>Bio-Vitals (HP)</span><span>${hpCur} / ${hpMax}</span>
                            </div>
                            <div class="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-700">
                                <div class="h-full ${hpColor} transition-all shadow-[0_0_8px_rgba(16,185,129,0.4)]" style="width: ${hpPct}%"></div>
                            </div>
                        </div>

                        <div class="grid grid-cols-3 gap-2 mb-4">
                            <div class="bg-slate-900/50 p-2 rounded border border-slate-800 text-center">
                                <span class="text-[9px] uppercase font-bold block mb-1 text-slate-500 datapad-font tracking-widest">Armor (AC)</span>
                                <span class="text-sm font-bold text-white datapad-font">${data.ac || 10}</span>
                            </div>
                            <div class="bg-slate-900/50 p-2 rounded border border-slate-800 text-center">
                                <span class="text-[9px] uppercase font-bold block mb-1 text-slate-500 datapad-font tracking-widest">Speed</span>
                                <span class="text-sm font-bold text-white datapad-font">${data.speed || 30}ft</span>
                            </div>
                            <div class="bg-slate-900/50 p-2 rounded border border-slate-800 text-center">
                                <span class="text-[9px] uppercase font-bold block mb-1 text-slate-500 datapad-font tracking-widest">Credits</span>
                                <span class="text-sm font-bold text-amber-400 datapad-font">${data.credits || 0}</span>
                            </div>
                        </div>

                        <!-- RESOURCES -->
                        <div class="space-y-2">
                            <span class="text-[10px] uppercase font-bold block text-slate-500 datapad-font tracking-widest">Resource Pools</span>
                            ${(data.resources || []).length > 0 ? data.resources.map(res => {
                                const resPct = res.max > 0 ? (res.current / res.max) * 100 : 0;
                                return `
                                <div class="bg-slate-900/30 p-2 rounded border border-slate-800/50">
                                    <div class="flex justify-between text-[9px] text-slate-400 mb-1">
                                        <span class="uppercase">${escapeHtml(res.name)}</span>
                                        <span>${res.current} / ${res.max}</span>
                                    </div>
                                    <div class="w-full bg-black/40 h-1.5 rounded-full overflow-hidden">
                                        <div class="h-full bg-sky-500 transition-all" style="width: ${resPct}%"></div>
                                    </div>
                                </div>
                                `;
                            }).join('') : '<span class="text-[10px] text-slate-600 italic">No custom resources active.</span>'}
                        </div>
                    </div>

                    <!-- RIGHT COLUMN: LOADOUT & FEATS -->
                    <div class="space-y-4">
                        <!-- LOADOUT -->
                        <div>
                            <span class="text-[10px] uppercase font-bold block mb-2 text-slate-500 datapad-font tracking-widest">Active Loadout</span>
                            <div class="bg-slate-900/50 rounded border border-slate-800 p-3">
                                <div class="grid grid-cols-1 gap-2">
                                    <div class="flex items-center gap-2">
                                        <div class="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-[10px] text-hud border border-hud/20">A</div>
                                        <span class="text-xs text-slate-300">${data.loadout?.armor ? escapeHtml(data.loadout.armor) : 'Standard Jumpsuit'}</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <div class="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-[10px] text-hud border border-hud/20">W</div>
                                        <span class="text-xs text-slate-300">${data.loadout?.main ? escapeHtml(data.loadout.main) : 'Unarmed / Improvised'}</span>
                                    </div>
                                    <div class="mt-2 pt-2 border-t border-slate-800 flex justify-between items-center">
                                        <span class="text-[9px] uppercase text-slate-500">Force Capacity</span>
                                        <span class="text-[10px] text-hud font-bold">${(data.knownPowers || []).length} Powers Mastered</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- FEATS -->
                        <div>
                            <span class="text-[10px] uppercase font-bold block mb-2 text-slate-500 datapad-font tracking-widest">Specializations & Feats</span>
                            <div class="flex flex-wrap gap-1">
                                ${(data.feats || []).length > 0 ? data.feats.map(f => `
                                    <span class="px-2 py-0.5 bg-hud/10 border border-hud/30 text-hud text-[10px] rounded uppercase">${escapeHtml(f)}</span>
                                `).join('') : '<span class="text-[10px] text-slate-600 italic">No unique specializations.</span>'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        });
        
        if (html === '') html = `<div class="text-slate-500 text-center text-sm py-10 datapad-font tracking-widest uppercase">Waiting for telemetry...</div>`;
        c.innerHTML = html;
    }

    // --- BOOT SEQUENCE LOGIC ---
    let bootSkipped = false;
    function skipBoot() {
        if(bootSkipped) return;
        bootSkipped = true;
        const bootScreen = document.getElementById('boot-screen');
        if (bootScreen) {
            bootScreen.style.opacity = '0';
            setTimeout(() => { bootScreen.style.display = 'none'; }, 400);
        }
    }
    async function runBootSequence() {
        bootSkipped = false;
        if (sessionStorage.getItem('sw5e_booted')) { 
            const bootScreen = document.getElementById('boot-screen');
            if (bootScreen) bootScreen.style.display = 'none'; 
            return; 
        }
        const bootContent = document.getElementById('boot-content');
        if (!bootContent) return;
        bootContent.innerHTML = '';
        const lines = ["ALLIANCE_OS v5.5.0 INITIALIZING...", "ESTABLISHING SECURE CONNECTION... [OK]", "DECRYPTING OPERATIVE PROTOCOLS... [OK]", "LOADING ARMORY DATABANKS... [OK]", "ACCESSING JEDI HOLOCRON... [WARNING: RESTRICTED]", "OVERRIDING ENCRYPTION... [OK]", "WELCOME, OPERATIVE."];
        for (let i = 0; i < lines.length; i++) {
            if(bootSkipped) break;
            const p = document.createElement('div'); p.className = 'boot-line'; p.innerHTML = `> ${lines[i]}<span class="cursor"></span>`; bootContent.appendChild(p);
            requestAnimationFrame(() => { p.style.opacity = '1'; });
            await new Promise(r => setTimeout(r, Math.random() * 200 + 200));
            const cursor = p.querySelector('.cursor'); if(cursor) cursor.remove();
        }
        if(!bootSkipped) { setTimeout(() => { sessionStorage.setItem('sw5e_booted', 'true'); skipBoot(); }, 800); }
    }

    function sendShipLog(mode) {
        const input = document.getElementById('dm-shiplog-input');
        if (!input) return;
        const text = input.value;
        if (!text) return;
        firebaseSync('shared/shiplog', { text: text, mode: mode, timestamp: Date.now() });
        input.value = '';
    }

    function showShipLog(text, mode) {
        if (logScrollInterval) clearInterval(logScrollInterval);
        
        const overlay = document.getElementById('ship-log-overlay');
        const textEl = document.getElementById('log-text');
        const dismissBtn = document.getElementById('log-dismiss-btn');
        const tsEl = document.getElementById('log-timestamp');
        
        if (!overlay || !textEl || !dismissBtn) return;

        // Reset state
        textEl.innerHTML = '';
        textEl.classList.remove('opacity-0', 'translate-y-4');
        textEl.classList.add('opacity-100', 'translate-y-0');
        dismissBtn.classList.add('opacity-0', 'pointer-events-none');
        tsEl.innerText = 'TS: ' + (Math.random() * 9000 + 1000).toFixed(4);
        
        overlay.classList.remove('hidden');
        overlay.classList.add('flex');
        setTimeout(() => overlay.style.opacity = '1', 10);
        
        if (mode === 'all') {
            textEl.innerHTML = text.split('\n').map(line => `<div class="log-line">${line}</div>`).join('');
            dismissBtn.classList.remove('opacity-0', 'pointer-events-none');
        } else {
            const lines = text.split('\n');
            let currentLine = 0;
            let currentChar = 0;
            
            logScrollInterval = setInterval(() => {
                if (currentLine < lines.length) {
                    // Check if we need to start a new line
                    let lineDiv = textEl.querySelector(`.log-line:nth-child(${currentLine + 1})`);
                    if (!lineDiv) {
                        lineDiv = document.createElement('div');
                        lineDiv.className = 'log-line';
                        textEl.appendChild(lineDiv);
                        currentChar = 0;
                    }

                    const lineText = lines[currentLine];
                    if (currentChar < lineText.length) {
                        lineDiv.innerText += lineText[currentChar];
                        playTypeSound();
                        currentChar++;
                        
                        // Auto scroll to bottom
                        const container = document.getElementById('log-content-container');
                        if (container) container.scrollTop = container.scrollHeight;
                    } else {
                        // Finished this line, move to next
                        currentLine++;
                    }
                } else {
                    clearInterval(logScrollInterval);
                    dismissBtn.classList.remove('opacity-0', 'pointer-events-none');
                }
            }, 30); // 30ms per character
        }
    }

    function dismissShipLog() {
        if (logScrollInterval) clearInterval(logScrollInterval);
        const overlay = document.getElementById('ship-log-overlay');
        if (!overlay) return;
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.classList.add('hidden');
            overlay.classList.remove('flex');
        }, 500);
    }

    function sendBroadcast() {
        const input = document.getElementById('dm-broadcast-input');
        if (!input || !input.value.trim()) return;
        const msg = input.value.trim().toUpperCase();
        try {
            db.ref('shared/broadcast').set({ message: msg, timestamp: Date.now() });
            input.value = '';
        } catch(e) {}
    }

    function showHolonetAlert(msg, alertColor) {
        const alertDiv = document.getElementById('holonet-alert');
        const titleEl = document.getElementById('holonet-title');
        const msgEl = document.getElementById('holonet-message');
        const icon = alertDiv.querySelector('svg');
        const btn = alertDiv.querySelector('button');
        
        // Parse Ship Alert Message if possible
        if (msg.includes('SHIP ALERT:')) {
            const parts = msg.replace('⚠ SHIP ALERT: ', '').split(' — ');
            titleEl.innerText = parts[0] || 'SHIP ALERT';
            msgEl.innerText = parts[1] || '';
        } else {
            titleEl.innerText = 'INCOMING ALERT';
            msgEl.innerText = msg;
        }
        
        // Apply color theme
        const c = alertColor || '#dc2626'; // default red
        alertDiv.style.background = `color-mix(in srgb, ${c} 15%, rgba(2,6,23,0.92))`;
        if (icon) icon.style.color = c;
        if (titleEl) { titleEl.style.color = c; titleEl.style.textShadow = `0 0 30px ${c}80`; }
        if (btn) { btn.style.borderColor = c; btn.style.color = c; }
        
        alertDiv.classList.remove('hidden');
        alertDiv.classList.add('flex');
        setTimeout(() => { alertDiv.style.opacity = '1'; }, 10);
    }

    function dismissAlert() {
        const alertDiv = document.getElementById('holonet-alert');
        alertDiv.style.opacity = '0';
        setTimeout(() => {
            alertDiv.classList.add('hidden');
            alertDiv.classList.remove('flex');
        }, 300);
    }

    function createCustomBounty() {
        const name = document.getElementById('dm-bounty-name').value;
        const reward = document.getElementById('dm-bounty-reward').value;
        if (!name) return;
        const newBounty = {
            id: 'custom_' + Date.now(),
            name: name,
            role: "Custom Target",
            desc: "Classified Imperial/Rebel target.",
            location: "Unknown",
            reward: reward || "Unknown",
            defaultStatus: "Active"
        };
        if (!state.customBounties) state.customBounties = [];
        state.customBounties.push(newBounty);
        saveState();
        firebaseSync('shared/customBounties', state.customBounties);
        
        const alertMsg = `NEW BOUNTY ISSUED: ${name.toUpperCase()} - REWARD: ${reward.toUpperCase()}`;
        firebaseSync('shared/broadcast', { message: alertMsg, timestamp: Date.now() });
        
        renderDM();
        renderBounties();
    }

    function deleteCustomBounty(id) {
        if(!state.customBounties) return;
        state.customBounties = state.customBounties.filter(b => b.id !== id);
        if(state.bountiesStatus && state.bountiesStatus[id]) {
            delete state.bountiesStatus[id];
        }
        saveState();
        try { 
            db.ref('shared/customBounties').set(state.customBounties); 
            if(state.bountiesStatus) db.ref('shared/bounties').set(state.bountiesStatus);
        } catch(e){}
        renderBounties();
    }

    function switchProfile() {
        localStorage.removeItem('sw5e_profile');
        location.reload();
    }
    
    function lockDatapad() {
        localStorage.removeItem('sw5e_gateway_auth');
        location.reload();
    }

    const PASSCODE = "IG-88";

    function checkGateway() {
        const inputEl = document.getElementById('gateway-input');
        const input = inputEl.value.trim().toUpperCase();
        const err = document.getElementById('gateway-error');

        if (input === PASSCODE || input === "IG88") {
            localStorage.setItem('sw5e_gateway_auth', 'true');
            const gateway = document.getElementById('security-gateway');
            gateway.style.opacity = '0';
            setTimeout(() => {
                gateway.style.display = 'none';
                
                // If we were trying to select DM profile via override
                if (localStorage.getItem('sw5e_profile_pending') === 'dm') {
                    localStorage.removeItem('sw5e_profile_pending');
                    localStorage.setItem('sw5e_profile', 'dm');
                    startApplication();
                } else {
                    checkProfileOnLoad();
                }
            }, 500);
        } else {
            if (err) {
                err.style.opacity = '1';
                setTimeout(() => { err.style.opacity = '0'; }, 2000);
            }
            inputEl.value = "";
            inputEl.focus();
        }
    }

    function checkAuthOnLoad() {
        const auth = localStorage.getItem('sw5e_gateway_auth');
        const gateway = document.getElementById('security-gateway');
        
        if (auth === 'true') {
            gateway.style.display = 'none';
            gateway.style.opacity = '0';
            checkProfileOnLoad();
        } else {
            gateway.style.display = 'flex';
            gateway.style.opacity = '1';
        }
    }

    function checkProfileOnLoad() {
        const savedProfile = localStorage.getItem('sw5e_profile');
        if (savedProfile) {
            startApplication();
        } else {
            const selector = document.getElementById('profile-selector');
            if (partyData.slot1 && partyData.slot1.name) document.getElementById('profile-btn-slot1').innerText = partyData.slot1.name;
            if (partyData.slot2 && partyData.slot2.name) document.getElementById('profile-btn-slot2').innerText = partyData.slot2.name;
            if (partyData.slot3 && partyData.slot3.name) document.getElementById('profile-btn-slot3').innerText = partyData.slot3.name;
            
            selector.style.display = 'flex';
            setTimeout(() => { selector.style.opacity = '1'; }, 10);
        }
    }

    function selectProfile(slot) {
        if (slot === 'dm') {
            const gateway = document.getElementById('security-gateway');
            localStorage.setItem('sw5e_profile_pending', 'dm');
            gateway.style.display = 'flex';
            setTimeout(() => { gateway.style.opacity = '1'; }, 10);
            document.getElementById('gateway-input').focus();
            
            if (localStorage.getItem('sw5e_gateway_auth') === 'true') {
                 localStorage.setItem('sw5e_profile', 'dm');
                 localStorage.removeItem('sw5e_profile_pending');
                 const selector = document.getElementById('profile-selector');
                 selector.style.opacity = '0';
                 setTimeout(() => { selector.style.display = 'none'; gateway.style.display = 'none'; }, 500);
                 startApplication();
            }
            return;
        }
        
        localStorage.setItem('sw5e_profile', slot);
        const selector = document.getElementById('profile-selector');
        selector.style.opacity = '0';
        
        startApplication();
        setTimeout(() => { selector.style.display = 'none'; }, 500);
    }

    function startApplication() {
        const bootScreen = document.getElementById('boot-screen');
        if (!sessionStorage.getItem('sw5e_booted')) {
            if(bootScreen) {
                bootScreen.style.display = 'flex';
                bootScreen.style.opacity = '1';
            }
        }
        
        const slot = localStorage.getItem('sw5e_profile') || 'slot1';
        
        loadState(); // Initial load
        
        // Sync activeSlot to the selected profile
        state.activeSlot = slot;
        state.isDM = (slot === 'dm');
        saveState(); // Ensure state is consistent
        
        loadSettingsUI();
        renderClasses();
        renderSpecies();
        renderArmoryFilters();
        renderArmory();
        renderHolocronFilters();
        renderHolocron();
        renderPlanets();
        renderBounties();
        renderCharacterSheet();
        renderLoadout();
        renderShip();
        
        if (state.isDM) {
            const dmBtn = document.getElementById('nav-dm');
            if (dmBtn) dmBtn.classList.remove('hidden');
            switchMainTab('dm');
            renderDM();
        } else {
            switchMainTab('character');
        }
        
        if (typeof runBootSequence === 'function') runBootSequence();
    }

    // --- INIT ---
    checkAuthOnLoad();
