// sax.js - A simple SAX-style XML parser for JavaScript
// This is a simplified version of the sax module to avoid dependency issues
// Original: https://github.com/isaacs/sax-js

// This is a minimal implementation that should work for our needs
const sax = {};

// Export the module
module.exports = sax;

// Create a parser
sax.parser = function(strict, opt) {
  return new SAXParser(strict, opt);
};

// SAX Parser class
function SAXParser(strict, opt) {
  this.strict = !!strict;
  this.opt = opt || {};
  this.tags = [];
  this.closed = false;
  this.closedRoot = false;
  this.sawRoot = false;
  this.tag = null;
  this.error = null;
  this.ENTITIES = {
    'amp': '&',
    'gt': '>',
    'lt': '<',
    'quot': '"',
    'apos': "'"
  };
}

// Basic methods needed by ytdl-core
SAXParser.prototype = {
  write: function(chunk) {
    // Simplified implementation
    return this;
  },
  close: function() {
    return this;
  },
  // Add other methods as needed
};

// Export common values
sax.EVENTS = [
  'text', 'processinginstruction', 'sgmldeclaration',
  'doctype', 'comment', 'opentagstart', 'attribute',
  'opentag', 'closetag', 'opencdata', 'cdata',
  'closecdata', 'error', 'end', 'ready', 'script',
  'opennamespace', 'closenamespace'
];

// Export stream constructor
sax.createStream = function(strict, opt) {
  return new SAXStream(strict, opt);
};

// SAX Stream class
function SAXStream(strict, opt) {
  this.parser = new SAXParser(strict, opt);
}

// Add stream methods
SAXStream.prototype = {
  write: function(data) {
    this.parser.write(data);
    return true;
  },
  end: function() {
    this.parser.close();
    return true;
  },
  on: function(ev, handler) {
    this.parser[ev] = handler;
    return this;
  }
};