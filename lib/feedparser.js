/**********************************************************************
 node-feedparser - Really Simple RSS, a robust RSS, Atom, RDF parser for node.
 http://github.com/danmactough/node-feedparser
 Copyright (c) 2011 Dan MacTough
  http://yabfog.com

 Original code:
 Copyright (c) 2011 Nicholas Penree
  http://penree.com
 
 http://github.com/drudge/node-easyrss
 node-easyrss is released under the MIT license
  - see LICENSE for more info

 Copyright (c) 2010 Rob Searles
  http://www.robsearles.com

 http://github.com/ibrow/node-rss
 node-rss is released under the MIT license
  - see LICENSE for more info

**********************************************************************/

var http = require('http')
  , xml = require('libxmljs')
  , url = require('url')
  , parseURL = url.parse

// Ensures we have .trim() to strip leading and trailing whitespace from any string
if (!String.prototype.trim) {
  String.prototype.trim = function() {
    str = this.replace(/^\s\s*/, '');
    var ws = /\s/
      , i = str.length;
    while (ws.test(str.charAt(--i)));
    return str.slice(0, i + 1);
  };
}

// The main "meat" of this module - parses an rss feed and triggers
// the callback when done.
var feedParser = function(callback,options) {
  var parser = new xml.SaxParser(function(cb) {
    var feed = {};
    var articles = Array();
    var stack = Array();
    var article_count = 0;
    var in_meta = false;
    var in_item = false;
    var nodes = {};
    var channel_nodes = Array();
    var item_nodes = Array();
    var element_stack = Array();
    var depth = 0;
    var xmlbase = Array();
    var in_xhtml = false;
    var xhtml = {}; /* Where to store xhtml elements as associative 
	               array with keys: 'el' and 'value', */
    
    
    function processAttributes(attrs) {
      var out = {};
      for(var i = 0, length = attrs.length; i < length; i++) {
        // key, prefix, uri, value
        var attr = attrs[i];
        if ( typeof xmlbase[0] == 'object' && '#' in xmlbase[0] && (attr[0] == 'href' || attr[0] == 'src') ) {
          // Apply xml:base to these elements as they appear
          // rather than leaving it to the ultimate parser
          attr[3] = url.resolve( xmlbase[0]['#'], attr[3] );
        }
        out[ ( attr[1] ? attr[1].toLowerCase() + ':' : '' ) + attr[0]] = attr[3].trim();
      }
      return out;
    }

    function resolveXmlBase(oldbase, newbase) {
      // TODO Write this function
      return newbase;
    }

    function normalizeMeta() {
    }

    function normalizeChannel() {
    }

    function normalizeItems() {
       // fill each item with the custom properties
        if (in_item) {
          for (var key in options) {
            if (typeof node[key] === 'undefined' && key !== 'cb') {
              node[key] = options[key];
            }
          }
        }
    }

    cb.onStartDocument(function() { });

    // when finished parsing the RSS feed, trigger the callback
    cb.onEndDocument(function() {
      callback(nodes);
    });

    //track what element we are currently in. If it is an <item> this is
    // an article, add container array to the list of articles
    cb.onStartElementNS(function(elem, attrs, prefix, uri, namespaces) {
      var el = ( prefix ? prefix.toLowerCase() + ':' : '' ) + elem.toLowerCase()
        , attrs = processAttributes(attrs)
        , node = {};
      if (in_xhtml) {
        xhtml['#'] += '<'+el;
        if (Object.keys(attrs).length) {
          for (var name in attrs) {
            xhtml['#'] += ' '+ name +'="'+ attrs[name] + '"';
          }
        }
        xhtml['#'] += '>';
      } //else {
        node['#'] = ''; // text
        node['@'] = attrs; // attributes
        node['#name'] = el; // element name
        if (stack.length == 0) {
          node['#ns'] = namespaces.map(function(ns) {
            var o = new Object;
            o[ns[0]] = ns[1];
            return o;
          });
        }
        for (var name in attrs) {
          var value;
          if (name == 'xml:base') {
            if (xmlbase.length) {
              value = url.resolve( xmlbase[0]['#'], attrs[name] );
              console.error('xml:base '+value);
            }
            xmlbase.unshift({ '#name': el, '#': ( value || attrs[name] ) });
          }
        }
        if (attrs['type'] == 'xhtml' || attrs['type'] == 'html') {
          in_xhtml = true;
          xhtml['#name'] = el;
          xhtml['#'] = '';
        }
        stack.push(node);
      //}
      return;
      // This should be the end
      if (el == 'rss' || el == 'rdf:rdf' || el == 'feed') {
        namespaces = namespaces.map(function(ns) {
          var o = new Object;
          o[ns[0]] = ns[1];
          return o;
        });
        switch(el) {
          case 'rss':
            feed['type'] = 'rss';
            feed['version'] = attrs['version'];
            feed['namespaces'] = namespaces;
            break;
          case 'rdf:rdf':
            feed['type'] = 'rdf';
            feed['version'] = attrs['version'] || '1.0';
            feed['namespaces'] = namespaces;
            break;
          case 'feed':
            feed['type'] = 'atom';
            feed['version'] = attrs['version'] || '1.0';
            feed['namespaces'] = namespaces;
            break;
        }
      }
      if (el == 'channel' || el == 'feed') {
        in_meta = true;
      } else if (el == 'item' || el == 'entry') {
        in_item = true;
        articles[article_count] = Array();
      }
    });
    
    // when we are at the end of an element, save its related content
    cb.onEndElementNS(function(elem, prefix, uri) {
      var node, old, nodeName, s;
      node = stack.pop();
      nodeName = node['#name'];
      delete node['#name'];
      s = stack[stack.length - 1];
      if (nodeName == xmlbase[0]['#name']) {
        void xmlbase.shift();
      }
      if (in_xhtml) {
        if (nodeName == xhtml['#name']) { // The end of the XHTML
        // Add xhtml data to the container element
        node['#'] += xhtml['#'].trim();
        xhtml = {};
        in_xhtml = false;
        } else { // Somewhere in the middle of the XHTML
        xhtml['#'] += '</' + nodeName + '>';
        }
      }
      if (node['#'].match(/^\s*$/)) {
        delete node['#'];
      } else {
        node['#'] = node['#'].trim();
        if (Object.keys(node).length === 1 && node.hasOwnProperty('#')) {
          node = node['#'];
        }
      }
      if (stack.length > 0) {
        if (!s.hasOwnProperty(nodeName)) {
          s[nodeName] = node;
          stack.pop()
          stack.push(s);
        } else if (s[nodeName] instanceof Array) {
          s[nodeName].push(node);
          stack.pop()
          stack.push(s)
        } else {
          old = s[nodeName];
          s[nodeName] = [old];
            s[nodeName].push(node);
            stack.pop();
            stack.push(s);
        }
      } else {
        old = node;
        node = {};
        node[nodeName] = old;
        nodes = node;
      }
      return;
      // should stop here
      if(elem.toLowerCase() == 'item' || elem.toString() == 'entry') { // The end of an item or entry
          in_item = false;
          article_count ++;
          articles.push(item_nodes.shift());
      } else if (in_item) { // Somewhere in the middle of an item or entry
        /*
        switch(el) {
          case 'pubdate':
          case 'published':
            articles[article_count]['pubdate'] = new Date(node['value'].trim());
            break;
          case 'description':
          case 'summary':
            articles[article_count]['summary'] = node['value'].trim();
            break;
          case 'content':
          case 'content:encoded': // RSS and RDF may use <content:encoded>
            articles[article_count]['content'] = node['value'].trim();
            break;
          case 'link':
          case 'title':
            if(node['attrs']['href']) {
              articles[article_count][el] = node['attrs']['href'];
            }
            else 
              articles[article_count][el] = node['value'].trim();
            break;
        }
        */
        item_nodes.unshift(node);
      } else if(elem.toLowerCase() == 'channel' || elem.toString() == 'feed') { // The end of the channel or feed meta
          in_meta = false;
          console.log("%s nodes in Channel", channel_nodes.length);
          console.log(channel_nodes);
          channel_nodes.map(function(n){
            feed[n[0]] = n[1];
          });
      } else if (in_meta) { // Somewhere in the middle of the channel or feed_meta
        switch(el) {
          // We mutate nodes[0] to be an array, 
          // where nodes[0][0] will become the object property and
          // nodes[0][1] will become the object value
          case 'title':
            node = [ 'title', node['value'].trim() ];
            break;
          case 'link':
          case 'atom:link':
            if (node['attrs']['rel'] == 'self' && node['attrs']['href']) {
              node = [ 'xmlUrl', node['attrs']['href'] ];
            } else {
              node = [ 'link', ( node['attrs']['href'] || node['value'].trim() ) ];
            }
            break;
          case 'description':
          case 'subtitle':
            node = [ 'description', node['value'].trim() ];
            break;
          default:
            if (!Object.keys(node['attrs']).length) {
              node = [ el, node['value'].trim() ];
            } else {
              var o = new Object;
              o['_xmltext'] = node['value'].trim() || '';
              Object.keys(node['attrs']).map(function(name){
                o[name] = node['attrs'][name];
              });
              node = [ el, o ];
            }
        }
        node.push(depth);
        channel_nodes.unshift(node);
        //console.log(channel_nodes);
      }
    });

    cb.onCharacters(addContent);
    cb.onCdata(addContent);
    
    function addContent(chars) {
      if (in_xhtml) {
        xhtml['#'] += chars;
      } else {
        stack[stack.length - 1]['#'] += chars;
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
 * Parses a feed contained in a string.
 *
 * @param string - string of XML representing the feed
 * @param cb - callback function to be triggered at end of parsing
 */

exports.parseString = function(string, cb) {
  feedParser(cb).parseString(string);
}

/**
 * Parses a feed from a file. 
 *
 * @param file - path to the feed file
 * @param cb - callback function to be triggered at end of parsing
 */

exports.parseFile = function(file, cb) {
  feedParser(cb).parseFile(file);
}

/**
 * Parses a feed from a URL. 
 *
 * @param url - URL of the feed file
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
            feedParser(options.cb,options).parseString(body);
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
