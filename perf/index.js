const fs = require('fs');
const path = require('path');
const unesc = require('../dist/util/unesc');
const selectors = fs.readFileSync(path.join(__dirname, 'selectors.css'), 'utf-8').split('\n');

for (let i = 0; i < 100; i++) {
    for (let s of selectors) {
        unesc(s);
    }
}

