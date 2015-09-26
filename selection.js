/* 
    # DIY selection 
    
    Disables browser selection behavior
    Selections are marked with *selected* and *selected-unwrap* classes
    Selection boundaries are marked with span.caret-start and span.caret
    
    ## TO DO
    
    Implement touch controls
    Move common root jQuery extensions out into their own file
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
    
    function leafNodesBetween(root, nodeA, nodeB, filter){
        root = $(root)[0];
        nodeA = $(nodeA);
        nodeB = $(nodeB);
        var first = nodeB,
            last = nodeA,
            nodes = [];
        if( nodeA.isBefore(nodeB) ){
            first = nodeA;
            last = nodeB;
        }
        var firstTop = first.parent()[0] === root ? first : first.parentsUntil(root).last();
        var lastTop = last.parent()[0] === root ? last : last.parentsUntil(root).last();
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
    
    function Selectable(root){
        this.root = $(root);
        this.selecting = false;
        this.setup();
        
        return this;
    }
    
    Selectable.prototype = {
        setup: function(){
            var sel = this;
            sel.root.allowSelection(false);
            sel.root.on('mousemove', '*', function(evt){           
                var elt = $(this);
                elt.spanify(true, true);
                if(sel.selecting && elt.is('.spanified')){
                    sel.find('.caret').remove();
                    if((evt.clientX - elt.offset().left) < elt.width() / 2){
                        caret().insertBefore(elt);
                    } else {
                        caret().insertAfter(elt);
                    }
                    sel.extendSelection();
                }
                evt.preventDefault();
                evt.stopPropagation();
            }).on('mousedown', '*', function(evt){
                var elt = $(this);
                sel.selecting = evt.originalEvent.detail;
                if(elt.is('.spanified')){
                    if(sel.selecting === 1){
                        sel.unmark();
                        sel.removeCarets();
                        if((evt.clientX - elt.offset().left) < elt.width() / 2){
                            caret('caret-start').insertBefore(this);
                        } else {
                            caret('caret-start').insertAfter(this);
                        }
                    } else {
                        sel.extendSelection();
                    }
                }
                evt.preventDefault();
                evt.stopPropagation();
            }).on('mouseup', function(evt){
                // console.log(sel.selecting);
                if(sel.selecting){
                    sel.extendSelection();
                    sel.selecting = false;
                }
                evt.preventDefault();
                evt.stopPropagation();
            });
        },
        removeCarets: function(){
            // console.log('removing carets');
            this.find('.caret,.caret-start').remove();
            return this;
        },
        extendSelection: function(){
            var sel = this, first, last;
            switch(sel.selecting){
                case 1:
                    sel.mark();
                    sel.root.children().not('.selected-block').spanify(false);
                    break;
                case 2:
                    // word select
                    first = sel.find('.caret-start').closest('.spanified-word');
                    last = sel.find('.caret').closest('.spanified-word');
                    if(!last.length){
                        last = first;
                    }
                    sel.markRange(first, last);
                    break;
                default:
                    // block select
                    first = sel.find('.caret-start').parentsUntil(sel.root).last();
                    last = sel.find('.caret').parentsUntil(sel.root).last();
                    if(last.length === 0){
                        last = first;
                    }
                    sel.markRange(first, last);
                    break;
            }
            return this;
        },
        find: function(selector){
            return this.root.find(selector);
        },
        unmark: function(){
            this.find('.selected-unwrap').contents().unwrap();
            this.find('.selected').removeClass('selected');
            this.find('.selected-block').removeClass('selected-block');
            this.find('.first-block').removeClass('first-block');
            this.find('.last-block').removeClass('last-block');
        },
        markRange: function(first, last){
            if(first.length === 0 || last.length === 0){
                console.error('Bad range, missing boundary', first, last);
            }
            if(first.is('.caret-start,.caret')){
                first = first.nextLeafNode();
            }
            if(last.is('.caret,.caret-start')){
                last = last.previousLeafNode();
            }
            this.removeCarets();
            
            // console.log('placing carets at range boundaries', first, last);
            if(first.isBefore(last)){
                caret('caret-start').insertBefore(first.firstLeafNode());
                caret().insertAfter(last.lastLeafNode());
            } else {
                caret().insertBefore(last.firstLeafNode());
                caret('caret-start').insertAfter(first.lastLeafNode());
            }
            this.mark();
            return this;
        },
        mark: function(){
            this.unmark();
            var start = this.find('.caret-start');
            var end = this.find('.caret');
            if(start.length === 0){
                return;
            } else if(end.length === 0){ 
                end = start; 
            } else if(end.length && end.isBefore(start)){
                var temp = start;
                start = end;
                end = temp;
            }
            
            var nodes = leafNodesBetween(this.root, start, end);
            var firstTopNode = start.parentsUntil(this.root).last().addClass('first-block');
            var lastTopNode = end.parentsUntil(this.root).last().addClass('last-block');
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
            
            return this;
        }
    }
}(jQuery));