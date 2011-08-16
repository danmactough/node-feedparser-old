/*!
 * node-feedparser
 * Copyright(c) 2011 Dan MacTough <danmactough@gmail.com>
 * MIT Licensed
 */

var rss = require(__dirname +'/../lib/feedparser')
  , inspect = require('util').inspect

rss.parseURL('http://scripting.com/rss.xml', function(posts){
  console.log(inspect(posts));
});
