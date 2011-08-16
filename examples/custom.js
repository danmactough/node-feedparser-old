/*!
 * node-feedparser
 * Copyright(c) 2011 Dan MacTough <danmactough@gmail.com>
 * MIT Licensed
 */

var rss = require(__dirname +'/../lib/feedparser')
  , inspect = require('util').inspect

rss.parseURL('http://scripting.com/rss.xml', {
  // there are custom properties we can define for each item in the rss feed 
  type: 'post',
  source: 'Scripting News',

  // callback with all the items parsed
  cb: function(posts) {
    var articles =  posts.sort(function (a, b) {
      // sort desc
      if (a.pubDate > b.pubDate) return -1;
      if (a.pubDate < b.pubDate) return 1;
      return 0;
    });

    console.log('Articles:');
    console.log(inspect(articles));
  }
});
