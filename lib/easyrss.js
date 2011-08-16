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
    var article_count = 0;
    var in_meta = false;
    var in_item = false;
    var nodes = Array();
    var stack = Array()
    var xmlbase = Array();
    var in_xhtml = false;
    var xhtml = {}; /* Where to store xhtml elements as associative 
	               array with keys: 'el' and 'value', */
    
    
    function processAttributes(attrs) {
      var out = {};
      for(var i = 0, length = attrs.length; i < length; i++) {
        // key, prefix, uri, value
        var attr = attrs[i];
        // Added the prefix -- ?TODO? normalize based on uri
        out[ ( attr[1] ? attr[1].toLowerCase() + ':' : '' ) + attr[0]] = attr[3].trim();
      }
      return out;
    }

    function resolveXmlBase(oldbase, newbase) {
      // TODO Write this function
      return '';
    }

    cb.onStartDocument(function() { });

    // when finished parsing the RSS feed, trigger the callback
    cb.onEndDocument(function() {
      callback(stack);
    });

    //track what element we are currently in. If it is an <item> this is
    // an article, add container array to the list of articles
    cb.onStartElementNS(function(elem, attrs, prefix, uri, namespaces) {
               // Added the prefix -- ?TODO? normalize based on uri
      var el = ( prefix ? prefix.toLowerCase() + ':' : '' ) + elem.toLowerCase()
        , attrs = processAttributes(attrs)
        , node = {};

      if (in_xhtml) {
        xhtml['value'] += '<'+el;
        if (attrs.length) {
          for (var name in attrs) {
            var value;
            if (name == 'href' || name == 'src') {
              /* Since this is a special case, apply
                 xml:base to these elements as they appear
                 rather than leaving it to the ultimate parser */
              value = resolveXmlBase( xmlbase[0]['value'], attrs[name] );
            }
            xhtml['value'] += ' '+ name +'="'+ (value || attrs[name]) + '"';
          }
        }
        xhtml['value'] += '>';
      } else {
        node['el'] = el;
        node['attrs'] = attrs;
        for (var name in attrs) {
          var value;
          if (name == 'xml:base') {
            if (xmlbase.length) {
              value = resolveXmlBase( xmlbase[0]['value'], attrs[name] );
            }
            xmlbase.unshift({ el: el, value: ( value || attrs[name] ) });
          }
        }
        node['value'] = '';
        node['xmlbase'] = '';
        node['childnodes'] = Array();
        // fill each item with the custom properties
        for (var key in options) {
          if (typeof node[key] === 'undefined' && key !== 'cb') {
            node[key] = options[key];
          }
        }
        nodes.push(node);
      }
      if (attrs['type'] == 'xhtml' || attrs['type'] == 'html') {
        in_xhtml = true;
        xhtml['el'] = el;
        xhtml['value'] = '';
      }
      if (el == 'rss' || el == 'rdf' || el == 'feed') {
        switch(el) {
          case 'rss':
            feed['type'] = 'rss';
            feed['version'] = attrs['version'];
            break;
          case 'rdf':
            feed['type'] = 'rdf';
            feed['version'] = attrs['version'] || '1.0';
            break;
          case 'feed':
            feed['type'] = 'atom';
            feed['version'] = attrs['version'] || '1.0';
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
      var el = ( prefix ? prefix.toLowerCase() + ':' : '' ) + elem.toLowerCase()
        , node = nodes.pop()
        ;
      stack.unshift(node);
      if (el == xhtml['el']) {
        // Add xhtml data to the container element
        node['value'] += xhtml['value'].trim();
        if (!Object.keys(node['attrs']).length) {
          delete node['attrs'];
        }
        if (xmlbase.length) {
          node['xmlbase'] = xmlbase[0];
        }
        if (!node['childnodes'].length) {
          delete node['childnodes'];
        }
        xhtml = {};
        in_xhtml = false;
      } else if (in_xhtml) {
        xhtml['value'] += '</' + el + '>';
      } else if (in_item) {
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
        if(elem.toLowerCase() == 'item' || elem.toString() == 'entry') {
          in_item = false;
          article_count ++;
        }
      } else if (in_meta) {
        switch(el) {
          case 'title':
            feed['title'] = node['value'].trim();
          case 'link':
          case 'atom:link':
            if (node['attrs']['rel'] == 'self' && node['attrs']['href']) {
              feed['xmlUrl'] = node['attrs']['href'];
            } else {
              feed['link'] = node['attrs']['href'] || node['value'].trim();
            }
            break;
          case 'description':
          case 'subtitle':
            feed['description'] = node['value'].trim();
            break;
        }
        if(elem.toLowerCase() == 'channel' || elem.toString() == 'feed') {
          in_meta = false;
        }
      }
    });

    cb.onCharacters(addContent);
    cb.onCdata(addContent);
    
    function addContent(chars) {
      if (in_xhtml) {
        xhtml['value'] += chars;
      } else if (in_meta || in_item) {
        nodes[ nodes.length - 1 ]['value'] += chars.trim();
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
