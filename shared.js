/*
    # Shared Utilities
*/

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
    return this[0].compareDocumentPosition($(otherElt)[0]) & 4;
}

$.fn.allowSelection = function(allow){
    if(allow){
        $(this).css({
            '-webkit-touch-callout': 'text',
            '-webkit-user-select': 'text',
            '-khtml-user-select': 'text',
            '-moz-user-select': 'text',
            '-ms-user-select': 'text',
            'user-select': 'text',
        });
    } else {
        $(this).css({
            '-webkit-touch-callout': 'none',
            '-webkit-user-select': 'none',
            '-khtml-user-select': 'none',
            '-moz-user-select': 'none',
            '-ms-user-select': 'none',
            'user-select': 'none',
        });
    }
    return this;
}

(function($){
/*
    DOM traversal utilities
*/
function leafNodes(node, filter){
    var nodeList = [];
    if(node.length && node.nodeType === undefined){
        // jQuery bag of nodes
        $.each(node, function(){
            nodeList = nodeList.concat(leafNodes(this));
        });
    } else if(!node.firstChild){
        // leaf node (e.g. text or <hr>
        nodeList.push(node);
    } else {
        // element
        for(var i = 0; i < node.childNodes.length; i++){
            nodeList = nodeList.concat(leafNodes(node.childNodes[i]));
        }
    }
    if(filter){
        var nodes = nodeList,
            i,
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
}
}(jQuery));