'use strict';

const { join } = require('node:path');

// Hoia Puppeteeri tõmmatud Chrome projekti sees, mitte ~/.cache kaustas.
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
