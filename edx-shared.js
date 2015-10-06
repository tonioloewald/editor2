/**
    # Shared Utilities

    Simple jQuery plugins used in other modules.
*/
/*jshint laxbreak: true */

(function($){
"use strict";

$.fn.loadFragment = function(url){
    var elt = this;
    return $.ajax(url).success(function(html){
        $('<div>').append(html).contents().appendTo(elt);
        $.each(elt.leafNodes(), function(){
            if(this.nodeType === 3 && this.data.match(/^\s*$/)){
                $(this).remove();
            }
        });
    });
};

$.fn.isBefore = function(otherElt){
    /*
        https://developer.mozilla.org/en-US/docs/Web/API/Node/compareDocumentPosition
        http://ejohn.org/blog/comparing-document-position/
        nodeA.compareDocumentPosition(nodeB) returns bitmask:
        1 -- disconnected
        2 -- nodeB is before nodeA
        4 -- nodeA is before nodeB
        8 -- nodeB contains nodeA
        16 -- nodeA contains nodeB
        32 -- ¯\_(ツ)_/¯
    */
    var answer = false;
    if(this.length && $(otherElt).length){
        answer = this[0].compareDocumentPosition($(otherElt)[0]) & 4;
    } else {
        console.warn('isBefore passed bad inputs:', this, otherElt);
    }
    return answer;
};

// returns the sibling order of a node (0 == first)
$.fn.siblingOrder = function(){
    var node = this[0];
    var parent = node.parentNode;
    var position = -1;
    if(parent){
        $.each(parent.childNodes, function(idx){
            if(this === node){
                position = idx;
                return false;
            }
        });
    }
    return position;
};

$.fn.firstLeafNode = function(){
    var node = this[0];
    while(node.firstChild){
        node = node.firstChild;
    }
    return $(node);
};

$.fn.lastLeafNode = function(){
    var node = this[0];
    while(node.lastChild){
        node = node.lastChild;
    }
    return $(node);
};

$.fn.nextLeafNode = function(base, filter){
    var node = this[0],
        next = null;
    if(node && node.nextSibling){
        next = $(node.nextSibling).firstLeafNode();
    } else if (node && node.parentNode !== (base || document.body)){
        next = $(node.parentNode).nextLeafNode();
    }
    if(next === null){
        return next;
    } else if(!filter){
        return next;
    } else if (typeof filter === 'string' && $(next).is(filter)){
        return next;
    } else if (typeof filter === 'function' && filter(next)){
        return next;
    } else {
        return $(next).nextLeafNode(base, filter);
    }
};

$.fn.previousLeafNode = function(base, filter){
    var node = this[0],
        previous = null;
    if(node && node.previousSibling){
        previous = $(node.previousSibling).lastLeafNode();
    } else if (node && node.parentNode !== (base || document.body)){
        previous = $(node.parentNode).previousLeafNode();
    }
    if(node === null){
        return node;
    } else if (!filter){
        return previous;
    } else if (typeof filter === 'string' && $(previous).is(filter)){
        return previous;
    } else if (typeof filter === 'function' && filter(previous)){
        return previous;
    } else {
        return $(previous).previousLeafNode(base, filter);
    }
};

$.fn.allowSelection = function(allow){
    if(allow){
        $(this).css({
            '-webkit-touch-callout': 'text',
            '-webkit-user-select': 'text',
            '-khtml-user-select': 'text',
            '-moz-user-select': 'text',
            '-ms-user-select': 'text',
            'user-select': 'text'
        });
    } else {
        $(this).css({
            '-webkit-touch-callout': 'none',
            '-webkit-user-select': 'none',
            '-khtml-user-select': 'none',
            '-moz-user-select': 'none',
            '-ms-user-select': 'none',
            'user-select': 'none'
        });
    }
    return this;
};
/*
    DOM traversal utilities
*/
function leafNodes(node, filter){
    var nodeList = [],
        i;
    if(node.length !== undefined && node.nodeType === undefined){
        // jQuery bag of nodes
        $.each(node, function(){
            nodeList = nodeList.concat(leafNodes(this));
        });
    } else if(!node.firstChild){
        // leaf node (e.g. text or <hr>
        nodeList.push(node);
    } else {
        // element
        for(i = 0; i < node.childNodes.length; i++){
            nodeList = nodeList.concat(leafNodes(node.childNodes[i]));
        }
    }
    if(filter){
        var nodes = nodeList;
        nodeList = [];
        if(typeof filter === 'string'){
            for(i = 0; i < nodes.length; i++){
                if($(nodes[i]).is(filter)){
                    nodeList.push(nodes[i]);
                }
            }
        } else if (typeof filter === 'function'){
            for(i = 0; i < nodes.length; i++){
                if(filter(nodes[i])){
                    if(filter(nodes[i])){
                        nodeList.push(nodes[i]);
                    }
                }
            }
        }
    }
    return nodeList;
}

$.fn.leafNodes = function(filter){
    return leafNodes(this, filter);
};
}(jQuery));
