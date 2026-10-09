const esbuild=require('esbuild');
esbuild.buildSync({entryPoints:['src/cloud-sync.js'],bundle:true,format:'esm',target:['es2022'],minify:true,outfile:'dist/cloud-sync.js',legalComments:'linked'});
console.log('Cloud login and synchronization bundle built.');
