import fs from 'fs';

// 1. Core Config Matrix
const CONFIG = {
    aspect_ratio: "2:3",
    engine_version: "v6",
    quality: "high"
};

// 2. The 7 Design Data Structures
const DESIGNS = {
    "1": {
        name: "Berserkers_3",
        subject: "male and female barbarian warrior, massive muscular build",
        gear: ["shirtless with battle scars and red war paint", "spiked iron plate pauldrons", "partial battle helm", "crimson red accents", "holding a massive double-bladed great axe"],
        pose: "full body standing pose",
        environment: "dark smoky red background with embers and rising smoke",
        lighting: "dramatic cinematic top-down key light"
    },
    "2": {
        name: "Charcters_for_landing_page",
        subject: "multi-character composition featuring three operator factions side by side: barbarian berserkers on left, griffin knights in center, skull-masked stealth assassins on right",
        gear: ["barbarians with red axes", "knights with blue glowing swords and crest shields", "assassins with glowing purple daggers"],
        pose: "dynamic heroic group standing lineup, diverse combat poses, unified perspective",
        environment: "epic panoramic game loading screen environment showcasing an ancient castle ruined by a modern dark warzone, clean framing, textless, no fonts, no UI overlays",
        lighting: "cinematic split-lighting matrix (fiery red left, electric blue center, misty purple right)"
    },
    "3": {
        name: "Phanthom_male_and_female",
        subject: "male and female tactical assassin operators together",
        gear: ["skull balaclava face masks with glowing purple eyes", "matching black tactical vests with MOLLE pouches and gear", "hoods up", "twin daggers with purple energy glow", "slim athletic builds", "dark hooded cloaks"],
        pose: "full standing pose with the female character standing coolly in front of the male character",
        environment: "dark purple smoke background with scattered tactical equipment crates and rubble",
        lighting: "dramatic cinematic lighting"
    },
    "4": {
        name: "Phanthom_3",
        subject: "male tactical assassin operator",
        gear: ["skull balaclava face mask with glowing purple eyes", "black tactical vest with MOLLE pouches and gear", "hood up", "twin daggers with purple energy glow", "slim athletic build", "dark hooded cloak"],
        pose: "full body slightly crouched action pose",
        environment: "dark purple smoke background, gritty street covered in debris",
        lighting: "dramatic cinematic lighting"
    },
    "5": {
        name: "Sentinel_male_and_female_2",
        subject: "heavily armored male and female knight warrior side-by-side",
        gear: ["full dark navy steel plate armor", "matching full plate helms with glowing blue eye visor slits", "massive tower shields with emblem on left arms", "longswords raised in right hands", "dramatic plate pauldrons", "flowing tabards"],
        pose: "full body standing pose",
        environment: "dark stormy castle background with rain and lightning flashes",
        lighting: "dramatic cinematic lighting with blue glow"
    },
    "6": {
        name: "Sentinel_2",
        subject: "heavily armored knight warrior",
        gear: ["full dark navy steel plate armor", "full plate helm with glowing blue eye visor slit", "massive tower shield with emblem on left arm", "longsword raised in right hand", "dramatic plate pauldrons", "flowing tabard"],
        pose: "full body standing pose",
        environment: "dark stormy background, ruined wet stone courtyard",
        lighting: "dramatic cinematic lighting with blue glow"
    },
    "7": {
        name: "StillHunt_Landing_Page",
        subject: "multi-character composition featuring three operator factions: barbarian berserkers on left (female crouching low, male standing behind), griffin knights in center (standing side-by-side), skull-masked stealth assassins on right (female lunging forward, male behind)",
        gear: ["barbarians with red axes", "knights with blue glowing swords and crest shields", "assassins with glowing purple daggers"],
        pose: "dynamic heroic group standing lineup, diverse combat poses, unified perspective",
        environment: "epic panoramic game loading screen environment, split-theme background transitioning from fire to castle rain to modern rubble with purple fog",
        lighting: "cinematic split-lighting matrix (fiery red left, electric blue center, misty purple right)"
    }
};

// 3. Prompt Compiler Logic
export function compilePrompt(id) {
    const d = DESIGNS[id];
    if (!d) return null;

    return `game character operator art, ${d.subject}, ${d.gear.join(', ')}, ${d.pose}, ${d.lighting}, ${d.environment}, hyperrealistic photorealistic render, Call of Duty Mobile operator portrait style --ar ${CONFIG.aspect_ratio} --v ${CONFIG.engine_version}`;
}

// 4. JSON Export
function exportToJSON(id, prompt, designName, outputDir = './prompts') {
    fs.mkdirSync(outputDir, { recursive: true });

    const payload = {
        id,
        name: designName,
        prompt,
        config: CONFIG,
        generatedAt: new Date().toISOString(),
    };

    const filePath = `${outputDir}/${designName}.json`;
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    console.log(`\x1b[32mExported → ${filePath}\x1b[0m`);
    return filePath;
}

// 5. CLI Execution — only runs when called directly, not when imported
const isMain = process.argv[1]?.endsWith('generator.js');
if (!isMain) { /* imported as module — skip CLI */ }
else {
const args = process.argv.slice(2);
const targetId = args[0];
const shouldExport = args.includes('--export');

if (!targetId || !DESIGNS[targetId]) {
    console.log('\nUsage: node generator.js <id> [--export]');
    console.log('  node generator.js 3          — print prompt');
    console.log('  node generator.js 3 --export — print + save to ./prompts/\n');
    console.log('Valid IDs:');
    Object.entries(DESIGNS).forEach(([k, v]) => console.log(`  ${k}  ${v.name}`));
    process.exit(1);
}

const finalPrompt  = compilePrompt(targetId);
const designName   = DESIGNS[targetId].name;

console.log(`\nCompiling prompt for target [${targetId}] (${designName})...`);
console.log(`\x1b[35m"${finalPrompt}"\x1b[0m\n`);

if (shouldExport) {
    exportToJSON(targetId, finalPrompt, designName);
}
} // end isMain
