/**********************************************************************
 node-easyrss - an RSS parser for node.
 http://github.com/drudge/node-easyrss

 Copyright (c) 2011 Nicholas Penree
 http://penree.com
 
 node-easyrss is released under the MIT license
  - see LICENSE for more info

 Original code:
  Copyright (c) 2010 Rob Searles
  http://www.robsearles.com

 node-rss is released under the MIT license
  - see LICENSE for more info

**********************************************************************/

var http = require('http')
  , xml = require('libxmljs')
  , parseURL = require('url').parse

// Adds .trim() to strip leading and trailing whitespace from any string
String.prototype.trim = function() {
  str = this.replace(/^\s\s*/, '');
  var ws = /\s/
    , i = str.length;
  while (ws.test(str.charAt(--i)));
  return str.slice(0, i + 1);
}

// The main "meat" of this module - parses an rss feed and triggers
// the callback when done.
var easyParser = function(callback,options) {
  var parser = new xml.SaxParser(function(cb) {
    var feed = {};
    var articles = Array();
    var current_element = false;
    var article_count = 0;
    var in_meta = false;
    var in_item = false;
    var current_chars = '';
    var current_attrs = {};
    
    function processAttributes(attrs) {
      var out = {};
      for(var index in attrs) {
        // key, prefix, uri, value
        var attr = attrs[index];
        // Added the prefix -- TODO normalize based on uri
        out[ ( attr[1] ? attr[1].toLowerCase() + ':' : '' ) + attr[0]] = attr[3].trim();
      }
      return out;
    }

    cb.onStartDocument(function() { });

    // when finished parsing the RSS feed, trigger the callback
    cb.onEndDocument(function() {
      callback({ articles: articles, feed: feed });
    });

    //track what element we are currently in. If it is an <item> this is
    // an article, add container array to the list of articles
    cb.onStartElementNS(function(elem, attrs, prefix, uri, namespaces) {
      // Added the prefix -- TODO normalize based on uri
      current_element = ( prefix ? prefix.toLowerCase() + ':' : '' ) + elem.toLowerCase();
      current_attrs = processAttributes(attrs);
      //console.log('Processing %s', current_element);
      if(current_element == 'rss' || current_element == 'rdf' || current_element == 'feed' /* Atom */) {
        in_meta = true;
      } else if(current_element == 'item' || current_element == 'entry') {
        in_item = true;
        articles[article_count] = Array();

        // fill each item with the custom properties
        for (var key in options) {
          if (typeof  articles[article_count][key] === 'undefined' && key !== 'cb') {
            articles[article_count][key] = options[key];
          }
        }
      }
    });
    
    // when we are at the end of an element, save its related content
    cb.onEndElementNS(function(elem, prefix, uri) {
      if(in_item) {
        switch(current_element) {
          case 'pubdate':
          case 'published':
            articles[article_count]['pubdate'] = new Date(current_chars.trim());
            break;
          case 'description':
          case 'summary':
            articles[article_count]['summary'] = current_chars.trim();
            break;
          case 'content':
          case 'content:encoded': // RSS and RDF may use <content:encoded>
            articles[article_count]['content'] = current_chars.trim();
            break;
          case 'link':
          case 'title':
            if(current_attrs['href']) {
              articles[article_count][current_element] = current_attrs['href'];
            }
            else 
              articles[article_count][current_element] = current_chars.trim();
            break;
        } 

        current_element = false;
        current_chars = '';
        if(elem.toLowerCase() == 'item' || elem.toString() == 'entry') {
          in_item = false;
          article_count ++;
        }
      } else if (in_meta) {
          switch(current_element) {
            case 'rss':
              feed['type'] = current_element;
              feed['version'] = current_attrs['version'];
              break;
            case 'rdf':
            case 'feed':
              feed['type'] = current_element;
              feed['version'] = current_attrs['version'] || '1.0';
              break;
            case 'title':
              feed['title'] = current_chars.trim();
            case 'link':
            case 'atom:link':
              if (current_attrs['rel'] == 'self' && current_attrs['href']) {
                feed['xmlUrl'] = current_attrs['href'];
              } else {
                feed['link'] = current_attrs['href'] || current_chars.trim();
              }
              break;
            case 'description':
            case 'subtitle':
              feed['description'] = current_chars.trim();
              break;
        }
        current_element = false;
        current_chars = '';
        if(elem.toLowerCase() == 'channel' || elem.toString() == 'feed') {
          in_meta = false;
        }
      }
    });

    cb.onCharacters(addContent);
    cb.onCdata(addContent);
    
    function addContent(chars) {
      // This doesn't work for elements with text nodes nested within other elements with text nodes
      if(in_meta || in_item) {
        current_chars += chars;
      }
    };

    // @TODO handle warnings and errors properly
    cb.onWarning(function(msg) {
      console.log('<WARNING>'+msg+"</WARNING>");
    });
    cb.onError(function(msg) {
      console.log('<ERROR>'+JSON.stringify(msg)+"</ERROR>");
    });
  });

  return parser;
}

/**
 * Parses an RSS feed from a file. 
 *
 * @param file - path to the RSS feed file
 * @param cb - callback function to be triggered at end of parsing
 */

exports.parseFile = function(file, cb) {
  easyParser(cb).parseFile(file);
}

/**
 * Parses an RSS feed from a URL. 
 *
 * @param url - URL of the RSS feed file
 * @param opts - object of objects including callback function to be triggered at end of parsing
 *
 * @TODO - decent error checking
 */

exports.parseURL = function(url, opts) {
  var options={};
  if(typeof opts=="function"){
    options.cb = opts;
  } else { 
    options=opts;
  }

  get_rss(url);
  function get_rss(url) {
    var parts = parseURL(url);

    // set the default port to 80
    if(!parts.port) { parts.port = 80; }

    var redirection_level = 0;
    var client = http.createClient(parts.port, parts.hostname);

    // include search terms in pathname if present

    var address = parts.pathname + (parts.search==undefined ? "" : parts.search);
    var request = client.request('GET', address, {'host': parts.hostname});

    request.addListener('response', function (response) {
      //sys.puts('STATUS: ' + response.statusCode);
      //sys.puts('HEADERS: ' + JSON.stringify(response.headers));
      // check to see the type of status
      switch(response.statusCode) {
        // check for ALL OK
        case 200:
          var body = ''; 
          response.addListener('data', function (chunk) { body += chunk; });
          response.addListener('end', function() {
            easyParser(options.cb,options).parseString(body);
          });
          break;
        // redirect status returned
        case 301:
        case 302:
          if(redirection_level > 10) {
            console.log("too many redirects");
          } else {
            console.log("redirect to "+response.headers.location);
            get_rss(response.headers.location);
          }
          break;
        default:
          /*
          response.setEncoding('utf8');
          response.addListener('data', function (chunk) {
            //sys.puts('BODY: ' + chunk);
          });
          */
          break;
	    }	  
	  });
	  
    request.end();	
  }
};
