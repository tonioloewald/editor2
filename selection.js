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
    
    $.fn.spanify = function(makeSpans, byWord){
        if(makeSpans){
            var textNodes = this.leafNodes(isTextNode),
                container = $('<span>'),
                wordSpan = $('<span>').addClass('spanified-word');
                charSpan = $('<span>').addClass('spanified');
            $.each(textNodes, function(){
                // for selection by chars
                // var pieces = new String(this.textContent);
                // for selection by words:
                var pieces;
                if(byWord){
                    pieces = this.textContent.match(/\s+|[^\s]+/g);
                } else {
                    pieces = new String(this.textContent);
                }
                if(pieces.length > 1){
                    $(this).parent().removeClass('spanified');
                    $.each(pieces, function(){
                        if(this.trim().length > 1){
                            console.log("" + this);
                            container.append(wordSpan.clone().text(this).spanify(true));
                        } else {
                            container.append(charSpan.clone().text(this));
                        }
                    });
                    $(this).replaceWith(container.contents());
                }
            });
        } else {
            this.find('.spanified-word').contents().unwrap();
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
        this.setup();
        
        return this;
    }
    
    Selectable.prototype = {
        setup: function(){
            var sel = this;
            sel.base.allowSelection(false);
            sel.base.on('mousemove', '*', function(evt){           
                var elt = $(this);
                elt.spanify(true, true);
                if(sel.selecting && elt.is('.spanified')){
                    sel.find('.caret').remove();
                    if((evt.clientX - elt.offset().left) < elt.width() / 2){
                        caret().insertBefore(elt);
                    } else {
                        caret().insertAfter(elt);
                    }
                    sel.mark();
                }
                evt.preventDefault();
                evt.stopPropagation();
            }).on('mousedown', '*', function(evt){
                var elt = $(this);
                if(elt.is('.spanified')){
                    sel.unmark();
                    sel.find('.caret,.caret-start').remove();
                    if((evt.clientX - elt.offset().left) < elt.width() / 2){
                        caret('caret-start').insertBefore(this);
                    } else {
                        caret('caret-start').insertAfter(this);
                    }
                    sel.selecting = true;
                }
                evt.preventDefault();
                evt.stopPropagation();
            }).on('mouseup', function(evt){
                if(sel.selecting){
                    sel.selecting = false;
                    $(this).children().not('.selected-block').spanify(false);
                    sel.mark();
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
            this.find('.selected-block').removeClass('selected-block');
            this.find('.first-block').removeClass('first-block');
            this.find('.last-block').removeClass('last-block');
        },
        markRange: function(first, last){
            this.find('.caret,.caret-start').remove();
            first = first.parentsUntil(this.base).last();
            last = last.parentsUntil(this.base).last();
            first.prepend(this.caret('select-start'));
            last.append(this.caret());
            this.mark();
        },
        mark: function(){
            this.unmark();
            var start = this.find('.caret-start');
            var end = this.find('.caret');
            if(end.length === 0){ 
                end = start; 
            } else if(end.isBefore(start)){
                var temp = start;
                start = end;
                end = temp;
            }
            
            var nodes = leafNodesBetween(this.base, start, end);
            var firstTopNode = start.parentsUntil(this.base).last().addClass('first-block');
            var lastTopNode = end.parentsUntil(this.base).last().addClass('last-block');
            var selectedSpan = $('<span>').addClass('selected-unwrap');
            firstTopNode.addClass('selected-block');
            if(firstTopNode[0] !== lastTopNode[0]){
                firstTopNode.add(firstTopNode.nextUntil(lastTopNode))
                            .add(lastTopNode)
                            .addClass('selected-block');
            }
            
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