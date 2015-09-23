/* 
    # DIY selection 
    
    Disables browser selection behavior
    Selections are marked with *selected* and *selected-unwrap* classes
    Selection boundaries are marked with span.caret-start and span.caret
    
    ## TO DO
    
    Implement touch controls
    Move common base jQuery extensions out into their own file
*/
(function($){
    $.fn.makeSelectable = function(){
        if(this.data('selectable')){
            console.error('selectable already exists?');
        } else {
            this.data('selectable', new Selectable(this));
        }
        return this;
    }
    
    function isTextNode(node){
        return node.nodeType === 3;
    }
    
    $.fn.spanify = function(makeSpans){
        if(makeSpans){
            var textNodes = this.leafNodes(isTextNode),
                container = $('<span>'),
                charSpan = $('<span>').addClass('spanified');
            $.each(textNodes, function(){
                if(this.length > 1){
                    $(this).parent().removeClass('spanified');
                    $.each(new String(this.textContent), function(){
                        container.append(charSpan.clone().text(this));
                    });
                    $(this).replaceWith(container.contents());
                }
            });
        } else {
            this.find('.spanified').contents().unwrap();
            this.each(function(){
                this.normalize();
            });
        }
        return this;
    }
    
    function leafNodesBetween(base, nodeA, nodeB, filter){
        base = $(base)[0];
        nodeA = $(nodeA);
        nodeB = $(nodeB);
        var first = nodeB,
            last = nodeA,
            nodes = [];
        if( nodeA.isBefore(nodeB) ){
            first = nodeA;
            last = nodeB;
        }
        var firstTop = first.parent()[0] === base ? first : first.parentsUntil(base).last();
        var lastTop = last.parent()[0] === base ? last : last.parentsUntil(base).last();
        first = first[0];
        last = last[0];
        if(firstTop[0] === lastTop[0]){
            // leaves in firstTop that are between first and last
            $.each(firstTop.leafNodes(), function(){
                if(
                    first.compareDocumentPosition(this) & 4
                    && this.compareDocumentPosition(last) & 4
                ){
                    nodes.push(this);
                }
            });
        } else {
            // leaves in the firstTop that are after first
            $.each(firstTop.leafNodes(), function(){
                if(first.compareDocumentPosition(this) & 4){
                    nodes.push(this);
                }
            });
            // leaves in the top nodes between firstTop and lastTop
            nodes = nodes.concat(firstTop.nextUntil(lastTop).leafNodes())
            // leaves in lastop that are before last
            $.each(lastTop.leafNodes(), function(){
                if(this.compareDocumentPosition(last) & 4){
                    nodes.push(this);
                }
            });
        }
        if(typeof filter === 'string'){
            var selector = filter;
            filter = function(){ return $(this).is(selector); };
        }
        if(typeof filter === 'function'){
            var nodeList = nodes;
            nodes = [];
            $.each(nodeList, function(){
                if(filter(this)){
                    nodes.push(this);
                }
            });
        }
        return nodes;
    }
    
    function caret(className){
        return $('<span>').addClass(className || 'caret');
    }
    
    function Selectable(base){
        this.base = $(base);
        this.selecting = false;
        
        return this;
    }
    
    Selectable.prototype = {
        setup: function(){
            this.allowSelection(false);
            this.base.on('mouseenter', '*', function(evt){           
                var elt = $(this);
                elt.spanify(true);
                if(selecting && elt.is('.spanified')){
                    this.find('.caret').remove();
                    if((evt.clientX - elt.offset().left) < elt.width() / 2){
                        caret().insertBefore(elt);
                    } else {
                        caret().insertAfter(elt);
                    }
                    this.mark();
                }
                evt.preventDefault();
                evt.stopPropagation();
            }).on('mouseleave', '*', function(evt){
                $(this).spanify(false);
                evt.preventDefault();
                evt.stopPropagation();
            }).on('mousedown', '*', function(evt){
                var elt = $(this);
                if(elt.is('.spanified')){
                    this.unmark();
                    this.find('.caret,.caret-start').remove();
                    if((evt.clientX - elt.offset().left) < elt.width() / 2){
                        caret('caret-start').insertBefore(this);
                    } else {
                        caret('caret-start').insertAfter(this);
                    }
                    selecting = true;
                }
                evt.preventDefault();
                evt.stopPropagation();
            }).on('mouseup', function(evt){
                if(selecting){
                    selecting = false;
                    $(this).spanify(false);
                    this.mark();
                }
                evt.preventDefault();
                evt.stopPropagation();
            });
        },
        find: function(selector){
            return this.base.find(selector);
        },
        unmark: function(){
            this.find('.selected-unwrap').contents().unwrap();
            this.find('.selected').removeClass('selected');
        },
        mark: function(){
            this.unmark();
            var start = this.find('.caret-start');
            var end = this.find('.caret')
            var nodes = leafNodesBetween(this.base, start, end);
            var selectedSpan = $('<span>').addClass('selected-unwrap');
            $.each(nodes, function(){
                if(this.nodeType === 3){
                    if(this.parentNode.childNodes.length === 1){
                        // text node that is an only child
                        $(this.parentNode).addClass('selected');
                    } else {
                        $(this).wrap(selectedSpan.clone());
                    }
                } else {
                    // style-able node (e.g. <img>, <hr>)
                    $(this).addClass('selected');
                }
            });
        }
    }
}(jQuery));