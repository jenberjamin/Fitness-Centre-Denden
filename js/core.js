/* FILENAME: core.js
   AUTHOR: Sam Bennett (System Architect) & Jen (Visionary)
   VERSION: 5.0 (Sister Protocol Edition)
*/

// --- 1. STORAGE KEYS ---
const STORAGE_KEY_LOGS = "LifeHub_Measurements";
const STORAGE_KEY_GOALS = "LifeHub_Goals";
const STORAGE_KEY_GALLERY = "LifeHub_Gallery";
const STORAGE_KEY_USER = "LifeHub_RPG_User"; 
const STORAGE_KEY_TEMPLATES = "lh_templates"; 

// --- 2. CONFIGURATION & RULES ---
const SYSTEM_CONFIG = {
    exchangeRate: 10,         // 10 MGP = 1 FP
    baseCompleteFP: 20,       // Full Workout
    basePartialFP: 10,        // Partial Workout 
    prestigeRatio: 0.8,       // 80% of FP converts to Prestige
    lutealMultiplier: 1.25,   // +25% Bonus 
    streakBuffer: 48,         // Hours before streak breaks
    graceCap: 2,              // Max Grace uses per week
    maxSetScore: 15           // Cap set score to prevent economy breaks
};

// Fitness Level Curve 
const FITNESS_LEVELS = [
    { lvl: 1, req: 0 },
    { lvl: 2, req: 50 },
    { lvl: 3, req: 150 },
    { lvl: 4, req: 250 }, 
    { lvl: 5, req: 400 }, 
    { lvl: 6, req: 600 },
    { lvl: 7, req: 850 },
    { lvl: 8, req: 1150 },
    { lvl: 9, req: 1500 },
    { lvl: 10, req: 1900 }, 
    { lvl: 11, req: 2350 },
    { lvl: 12, req: 2850 },
    { lvl: 13, req: 3400 },
    { lvl: 14, req: 4000 },
    { lvl: 15, req: 4650 }, 
    { lvl: 16, req: 5350 },
    { lvl: 17, req: 6100 },
    { lvl: 18, req: 6900 },
    { lvl: 19, req: 7750 },
    { lvl: 20, req: 8650 }, 
    { lvl: 21, req: 10000 }
];

// Muscle Group Curve 
const MUSCLE_LEVELS = [
    { lvl: 1, req: 0 },
    { lvl: 2, req: 100 },
    { lvl: 3, req: 300 },
    { lvl: 4, req: 600 },
    { lvl: 5, req: 1000 },
    { lvl: 6, req: 1500 },
    { lvl: 7, req: 2100 },
    { lvl: 8, req: 2800 },
    { lvl: 9, req: 3600 },
    { lvl: 10, req: 4500 }
];

// --- 3. INITIALIZATION ---

// Legacy Data
let historyLogs = loadData(STORAGE_KEY_LOGS, []);
let goals = loadData(STORAGE_KEY_GOALS, { "Weight": 40 });
let galleryPosts = loadData(STORAGE_KEY_GALLERY, []);

// RPG User Data 
let UserProfile = loadData(STORAGE_KEY_USER, {
    fitnessPoints: 0,    
    fitnessLevel: 1,
    prestigeCurrency: 0, 
    streak: 0,
    lastWorkout: null,   
    graceUsed: 0,        
    lastGraceWeek: getWeekNumber(new Date()), 
    muscles: {},         
    prs: {},
    systemLogs: [],
    profileSlides: [],
    schedule: {} 
});

// --- SYSTEM PATCH: DATA MIGRATION ---
if (!UserProfile.prs) UserProfile.prs = {};
if (!UserProfile.muscles) UserProfile.muscles = {};
if (typeof UserProfile.prestigeCurrency === 'undefined') UserProfile.prestigeCurrency = 0;
if (typeof UserProfile.streak === 'undefined') UserProfile.streak = 0;
if (typeof UserProfile.fitnessPoints === 'undefined') UserProfile.fitnessPoints = 0;
if (!UserProfile.systemLogs) UserProfile.systemLogs = []; 
if (!UserProfile.profileSlides) UserProfile.profileSlides = [];
if (!UserProfile.schedule) UserProfile.schedule = {};

// Run Weekly Grace Reset Check on Load
checkGraceReset();

console.log("LifeHub Core v5.0: SISTER EDITION");

// --- 4. THE LOGIC ENGINES ---

/**
 * ENGINE A: RELATIVE EFFORT CALCULATOR
 */
function calculateSetScore(dbId, type, val1, val2) {
    let vol = 0;
    const v1 = parseFloat(val1) || 0;
    const v2 = parseFloat(val2) || 0;

    if (type === "Weight & Reps") vol = v1 * v2; 
    else if (type === "Reps") vol = v1; 
    else if (type === "Time") vol = v1 + (v2 * 60); 
    else if (type === "Distance") vol = v1; 
    
    const pr = UserProfile.prs[dbId] || 0;
    let score = 0;

    if (pr === 0) {
        score = 8.0; 
    } else {
        score = (vol / pr) * 10; 
    }

    if (score > SYSTEM_CONFIG.maxSetScore) score = SYSTEM_CONFIG.maxSetScore; 

    return { score: score, vol: vol, isPR: (vol > pr) };
}

/**
 * ENGINE B: WORKOUT PROCESSOR
 */
function processWorkoutSession(activeWorkout, isLuteal, isComplete) {
    const report = {
        earnedMGP: {}, 
        totalSessionMGP: 0,
        baseFP: isComplete ? SYSTEM_CONFIG.baseCompleteFP : SYSTEM_CONFIG.basePartialFP,
        effortFP: 0,
        streakFP: 0,
        totalFP: 0,
        earnedPrestige: 0,
        levelUps: [],
        newPRs: [],
        generatedLogs: [] 
    };

    // 1. Process Exercises for MGP
    if (activeWorkout.exercises) {
        activeWorkout.exercises.forEach(ex => {
            let exerciseMGP = 15; 
            let maxVolInSession = 0;

            if(ex.sets && Array.isArray(ex.sets)) {
                ex.sets.forEach(set => {
                    const result = calculateSetScore(ex.dbId, ex.type, set[0], set[1]);
                    exerciseMGP += result.score;
                    if(result.vol > maxVolInSession) maxVolInSession = result.vol;
                });
            }

            const currentPR = UserProfile.prs[ex.dbId] || 0;
            if (maxVolInSession > currentPR) {
                UserProfile.prs[ex.dbId] = maxVolInSession;
                report.newPRs.push(ex.name);
            }

            if(ex.details && ex.details.target && Array.isArray(ex.details.target)) {
                ex.details.target.forEach(muscle => {
                    if (!report.earnedMGP[muscle]) report.earnedMGP[muscle] = 0;
                    report.earnedMGP[muscle] += exerciseMGP;
                    report.totalSessionMGP += exerciseMGP;
                });
            }
        });
    }

    // 2. Luteal Multiplier
    if (isLuteal) {
        const multi = SYSTEM_CONFIG.lutealMultiplier;
        report.totalSessionMGP = report.totalSessionMGP * multi;
        report.baseFP = Math.round(report.baseFP * multi); 
        
        for (let m in report.earnedMGP) {
            report.earnedMGP[m] = report.earnedMGP[m] * multi;
        }
        report.generatedLogs.push({
            text: `[LUTEAL BONUS] 25% Multiplier Applied`,
            type: 'bonus', highlight: true
        });
    }

    // 3. CLEAN UP MGP (ROUNDING)
    report.totalSessionMGP = Math.round(report.totalSessionMGP);
    for (let m in report.earnedMGP) {
        report.earnedMGP[m] = Math.round(report.earnedMGP[m]);
    }

    // 4. Currency Exchange
    report.effortFP = Math.round(report.totalSessionMGP / SYSTEM_CONFIG.exchangeRate);

    // 5. Streak Logic
    const projectedStreak = UserProfile.streak + 1;
    let bonus = 0;
    
    if (projectedStreak === 50) bonus = 1500;
    else if (projectedStreak === 20) bonus = 450;
    else if (projectedStreak === 12) bonus = 200;
    else if (projectedStreak === 8) bonus = 100;
    else if (projectedStreak === 4) bonus = 50;
    
    report.streakFP = bonus; 

    if (bonus > 0) {
        report.generatedLogs.push({
            text: `[STREAK MILESTONE] ${projectedStreak} Days! +${bonus} FP`,
            type: 'milestone', highlight: true
        });
    }

    // 6. Totals
    report.totalFP = Math.round(report.baseFP + report.effortFP + report.streakFP);
    report.earnedPrestige = Math.round(report.totalFP * SYSTEM_CONFIG.prestigeRatio);

    // 7. Generate Logs
    const status = isComplete ? "COMPLETE" : "PARTIAL";
    report.generatedLogs.push({
        text: `[WORKOUT ${status}] +${report.baseFP} Base FP`,
        type: 'workout', highlight: false
    });

    for (const [muscle, points] of Object.entries(report.earnedMGP)) {
        if(points > 0) {
            report.generatedLogs.push({
                text: `[+${points} MGP] ${muscle} Growth`,
                type: 'mgp', highlight: false
            });
        }
    }

    if(report.earnedPrestige > 0) {
        report.generatedLogs.push({
            text: `[+${report.earnedPrestige} PRESTIGE] Funds Acquired`,
            type: 'prestige', highlight: true
        });
    }

    // 8. Commit
    updateSystem(report);
    
    return report;
}

/**
 * ENGINE C: SYSTEM UPDATE
 */
function updateSystem(report) {
    const timestamp = new Date().toISOString();

    // 1. Update Muscles
    for (const [muscle, points] of Object.entries(report.earnedMGP)) {
        if (!UserProfile.muscles[muscle]) UserProfile.muscles[muscle] = { xp: 0, level: 1 };
        
        let mData = UserProfile.muscles[muscle];
        let oldLvl = mData.level;
        mData.xp += points;
        
        let stat = getLevelStatus(mData.xp, MUSCLE_LEVELS);
        mData.level = stat.level;
        
        if (mData.level > oldLvl) {
            report.generatedLogs.push({ text: `[LEVEL UP] ${muscle} -> Level ${mData.level}`, type: 'levelup', highlight: true });
        }
    }

    // 2. Update Fitness Points & Prestige
    let oldFitLvl = UserProfile.fitnessLevel;
    UserProfile.fitnessPoints += report.totalFP;
    UserProfile.prestigeCurrency += report.earnedPrestige;
    
    let fitStat = getLevelStatus(UserProfile.fitnessPoints, FITNESS_LEVELS, true);
    UserProfile.fitnessLevel = fitStat.level;

    if (UserProfile.fitnessLevel > oldFitLvl) {
        report.generatedLogs.push({ text: `[RANK UP] FITNESS LEVEL ${UserProfile.fitnessLevel}`, type: 'levelup', highlight: true });
    }

    // 3. Streak Logic
    const now = new Date();
    if (UserProfile.lastWorkout) {
        const last = new Date(UserProfile.lastWorkout);
        const diffHours = (now - last) / 36e5;
        
        if (diffHours < SYSTEM_CONFIG.streakBuffer) {
            UserProfile.streak += 1;
        } else {
            UserProfile.streak = 1; 
        }
    } else {
        UserProfile.streak = 1;
    }
    
    UserProfile.lastWorkout = now.toISOString();

    // 4. Save Logs
    report.generatedLogs.forEach(log => {
        log.date = timestamp;
        UserProfile.systemLogs.push(log);
    });

    if(UserProfile.systemLogs.length > 100) {
        UserProfile.systemLogs = UserProfile.systemLogs.slice(-100);
    }

    saveSystemData();
    console.log("SYSTEM SYNC COMPLETE:", report);
}

/**
 * ENGINE D: LEVEL CALCULATOR
 */
function getLevelStatus(currentPoints, levelTable, gateCheck = null) {
    let currentLvl = 1;
    let nextThreshold = levelTable[1].req;
    let prevThreshold = 0;
    let tableIndex = -1;
    let isCapped = false;

    for (let i = 0; i < levelTable.length - 1; i++) {
        const nextTier = levelTable[i+1];
        if (currentPoints >= nextTier.req) {
            let isGated = false;
            if (nextTier.gate && gateCheck) {
                const mStat = UserProfile.muscles[nextTier.gate.muscle] || { level: 1 };
                if (mStat.level < nextTier.gate.lvl) isGated = true;
            }
            if (isGated) {
                isCapped = true;
                return { level: levelTable[i].lvl, pct: 100, currentPoints: currentPoints, nextReq: nextTier.req, isCapped: true };
            }
            currentLvl = nextTier.lvl;
            prevThreshold = nextTier.req;
            tableIndex = i + 1;
        } else {
            nextThreshold = nextTier.req;
            break;
        }
    }

    if (tableIndex === levelTable.length - 1 && !isCapped) {
        const lastDefined = levelTable[levelTable.length - 1];
        const extraPoints = currentPoints - lastDefined.req;
        const pointsPerInfiniteLevel = 1000; 
        const extraLevels = Math.floor(extraPoints / pointsPerInfiniteLevel);
        currentLvl = lastDefined.lvl + extraLevels;
        prevThreshold = lastDefined.req + (extraLevels * pointsPerInfiniteLevel);
        nextThreshold = prevThreshold + pointsPerInfiniteLevel;
    }

    const range = nextThreshold - prevThreshold;
    const gained = currentPoints - prevThreshold;
    let pct = Math.floor((gained / range) * 100);
    if (pct > 100) pct = 100;

    return { level: currentLvl, pct: pct, currentPoints: currentPoints, nextReq: nextThreshold, isCapped: isCapped };
}

// --- 5. GRACE SYSTEM ---

function checkGraceReset() {
    const currentWeek = getWeekNumber(new Date());
    if (currentWeek !== UserProfile.lastGraceWeek) {
        UserProfile.graceUsed = 0;
        UserProfile.lastGraceWeek = currentWeek;
        saveSystemData();
        console.log("Weekly Grace Cap Reset");
    }
}

function activateGrace() {
    if (UserProfile.graceUsed >= SYSTEM_CONFIG.graceCap) return false;
    
    UserProfile.graceUsed += 1;
    UserProfile.lastWorkout = new Date().toISOString(); 
    
    UserProfile.systemLogs.push({
        text: "[GRACE PROTOCOL] Streak Paused",
        date: new Date().toISOString(),
        type: "grace", highlight: true
    });
    
    saveSystemData();
    return true;
}

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
    return weekNo;
}

// --- 6. UTILITIES ---

function loadData(key, fallback) {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
}

// --- MODIFIED SAVE SYSTEM (HYBRID CLOUD) ---
function saveSystemData() {
    // 1. Save Locally
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(historyLogs));
    localStorage.setItem(STORAGE_KEY_GOALS, JSON.stringify(goals));
    localStorage.setItem(STORAGE_KEY_GALLERY, JSON.stringify(galleryPosts));
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(UserProfile));
    
    console.log("System Saved (Local).");

    // 2. Trigger Cloud Sync
    if (window.syncToCloud) {
        window.syncToCloud();
    }
}

function getStatsForDate(targetDateStr) {
    const sortedLogs = [...historyLogs].sort((a, b) => new Date(a.date) - new Date(b.date));
    let foundStats = { Weight: "--", BMI: "--" };
    const target = new Date(targetDateStr);

    sortedLogs.forEach(log => {
        const logDate = new Date(log.date);
        if (logDate <= target) {
            const w = log.data.Weight;
            if(w) {
                foundStats.Weight = w + "kg";
                foundStats.BMI = (w / ((1.60) ** 2)).toFixed(1); 
            }
        }
    });
    return foundStats;
}

// --- 7. PWA SYSTEM INITIALIZATION ---

if ('serviceWorker' in navigator) {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = 'manifest.json';
    document.head.appendChild(link);

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((reg) => {
            console.log('LifeHub Service Worker Registered: ', reg.scope);
        }).catch((err) => {
            console.log('Service Worker Registration Failed: ', err);
        });
    });
}

// --- 8. FIREBASE SATELLITE DISH (SISTER EDITION) ---

(function initFirebase() {
    // A. Configuration (Sister Keys)
    const firebaseConfig = {
      apiKey: "AIzaSyAL3zOJ0UAGDzVWFIXbbBrTs6Jtfn0_8kw",
      authDomain: "fitness-centre-denden.firebaseapp.com",
      projectId: "fitness-centre-denden",
      storageBucket: "fitness-centre-denden.firebasestorage.app",
      messagingSenderId: "679894458386",
      appId: "1:679894458386:web:9582f07a8228d777f478cb",
      measurementId: "G-02VX9BKT0B"
    };

    // B. Dynamically Load Firebase SDKs
    const scriptApp = document.createElement('script');
    scriptApp.src = "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js";
    
    const scriptDB = document.createElement('script');
    scriptDB.src = "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js";

    document.head.appendChild(scriptApp);
    
    // Wait for App to load, then load DB
    scriptApp.onload = () => {
        document.head.appendChild(scriptDB);
        
        scriptDB.onload = () => {
            // C. Initialize Firebase
            try {
                const app = firebase.initializeApp(firebaseConfig);
                const db = firebase.firestore();
                console.log("CLOUD PROTOCOL: Online");

                // D. Create the Sync Function (Global)
                window.syncToCloud = function() {
                    const templates = localStorage.getItem('lh_templates') || "[]";
                    
                    // The Big Data Packet
                    const payload = {
                        userProfile: UserProfile,
                        measurements: historyLogs,
                        goals: goals,
                        gallery: galleryPosts,
                        templates: JSON.parse(templates), // Send raw template DB
                        lastSync: new Date().toISOString()
                    };

                    // Send to Cloud (Collection: LifeHub_Backups, Doc: Sister_Data)
                    db.collection("LifeHub_Backups").doc("Sister_Data").set(payload)
                    .then(() => {
                        console.log("☁️ CLOUD SYNC: Success");
                    })
                    .catch((error) => {
                        console.warn("☁️ CLOUD SYNC: Failed (Offline?)", error);
                    });
                };
                
                // Try one initial sync on load
                window.syncToCloud();

            } catch (e) {
                console.error("Firebase Init Error:", e);
            }
        };
    };
})();