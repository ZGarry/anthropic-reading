// Input is the public firebaseConfig object only, never an admin/service-account key.
const fs=require('node:fs');
const file=process.argv[2];if(!file)throw new Error('Usage: node scripts/configure_firebase.cjs public-firebase-config.json');
const value=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const allowed=new Set(['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId','measurementId']);
if(Object.keys(value).some(k=>!allowed.has(k)))throw new Error('Only public Firebase web app settings are accepted');
for(const key of ['apiKey','authDomain','projectId','appId'])if(typeof value[key]!=='string'||!value[key])throw new Error('Missing '+key);
if(!/^[a-z0-9.-]+$/.test(value.authDomain)||!value.authDomain.endsWith('.firebaseapp.com'))throw new Error('Use the Firebase project auth domain');
fs.writeFileSync('dist/firebase-config.js','// Public Firebase web-app settings; access is protected by Firestore rules.\nwindow.READING_FIREBASE_CONFIG = '+JSON.stringify(value,null,2)+';\n');
console.log('Configured public web app for project '+value.projectId);
