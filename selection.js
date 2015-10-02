/*
    # DIY selection

    Disables browser selection behavior
    Selections are marked with *selected* class
    Selection boundaries are marked with span.caret-start and span.caret

    ## TO DO

    Implement touch controls
    Move common root jQuery extensions out into their own file
*/
/*jshint laxbreak: true */

(function($){
    "use strict";

    $.fn.makeSelectable = function(){
        if(this.data('selectable')){
            console.error('selectable already exists?');
        } else {
            this.data('selectable', new Selectable(this));
        }
        return this;
    };

    function isTextNode(node){
        return node.nodeType === 3 && $(node).closest('.do-not-spanify').length === 0;
    }

    function isSelectable(node){
        return $(node).closest('.not-selectable').length === 0;
    }

    $.fn.spanify = function(makeSpans, byWord){
        if(makeSpans){
            var textNodes = this.leafNodes(isTextNode),
                container = $('<span>'),
                wordSpan = $('<span>').addClass('spanified-word'),
                charSpan = $('<span>').addClass('spanified');
            $.each(textNodes, function(){
                // for selection by chars
                // var pieces = new String(this.textContent);
                // for selection by words:
                var pieces;
                if(byWord){
                    pieces = this.textContent.match(/\s+|\w+|[^\w^\s]+/g);
                } else {
                    pieces = this.textContent.split(''); // new String(this.textContent);
                }
                if(pieces.length > 1 || pieces[0].length > 1){
                    $(this).parent().removeClass('spanified');
                    $.each(pieces, function(){
                        if(this.length > 1){
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
    };

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
            nodes = nodes.concat(firstTop.nextUntil(lastTop).leafNodes());
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
            sel.root.on('mousemove.selectable', '*', function(evt){
                if($(evt.target).is('.not-selectable') || $(evt.target).closest('.not-selectable').length > 0){
                    return;
                }
                var elt = $(this);
                elt.spanify(true, true);
                if(sel.selecting && elt.is('.spanified')){
                    sel.find('.caret').remove();
                    if((evt.clientX - elt.offset().left) < elt.width() / 2){
                        $(sel.caret).insertBefore(elt);
                    } else {
                        $(sel.caret).insertAfter(elt);
                    }
                    sel.extendSelection();
                }
                evt.preventDefault();
                evt.stopPropagation();
            }).on('mousedown.selectable', '*', function(evt){
                if($(evt.target).is('.not-selectable') || $(evt.target).closest('.not-selectable').length > 0){
                    return;
                }
                var elt = $(this);
                sel.selecting = evt.originalEvent.detail;
                if(elt.is('.spanified')){
                    if(evt.shiftKey){
                        sel.find('.caret').remove();
                        if((evt.clientX - elt.offset().left) < elt.width() / 2){
                            $(sel.caret).insertBefore(elt);
                        } else {
                            $(sel.caret).insertAfter(elt);
                        }
                        sel.mark();
                    } else if(sel.selecting === 1){
                        sel.unmark();
                        sel.removeCarets();
                        if((evt.clientX - elt.offset().left) < elt.width() / 2){
                            $(sel.caretStart).add($(sel.caret)).insertBefore(elt);
                        } else {
                            $(sel.caretStart).add($(sel.caret)).insertAfter(elt);
                        }
                    } else {
                        sel.extendSelection();
                    }
                }
                evt.preventDefault();
                evt.stopPropagation();
            }).on('mouseup.selectable', function(evt){
                if($(evt.target).is('.not-selectable') || $(evt.target).closest('.not-selectable').length > 0){
                    return;
                }
                // console.log(sel.selecting);
                if(sel.selecting){
                    sel.extendSelection();
                    sel.selecting = false;
                }
                sel.selectionChanged();
                // if we're currently editable then focus the caret
                sel.find('input.caret').focus();
                evt.preventDefault();
                evt.stopPropagation();
            });
        },
        /* Synthetic event triggered by selection change */
        selectionChanged: function(){
            this.root.trigger('selectionchanged');
        },
        caret: '<span class="caret"></span>',
        caretStart: '<span class="caret-start"></span>',
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
                    break;
                case 2:
                    // word select
                    first = sel.find('.caret-start');
                    if(first.closest('.spanified-word').length){
                        first = first.closest('.spanified-word');
                    }
                    last = sel.find('.caret');
                    if(!last.length){
                        last = first;
                    } else if(last.closest('.spanified-word').length){
                        last = last.closest('.spanified-word');
                    }
                    if(first.length && last.length){
                        sel.markRange(first, last);
                    }
                    break;
                default:
                    // block select
                    first = sel.find('.caret-start')
                               .parentsUntil(sel.root).last();
                    last = sel.find('.caret')
                              .parentsUntil(sel.root).last();
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
            this.find('span.unwrap').each(function(){
                if(this.classList.length === 1 && this.attributes.length === 1){
                    $(this).contents().unwrap();
                }
            });
            this.find('.selected').removeClass('selected');
            this.find('.selected-block').removeClass('selected-block');
            this.find('.first-block').removeClass('first-block');
            this.find('.last-block').removeClass('last-block');
            return this;
        },
        markRange: function(first, last){
            var sel = this;
            if(first.length === 0 || last.length === 0){
                console.error('Bad range, missing boundary', first, last);
                return;
            }
            if(first.is('.caret-start,.caret')){
                first = first.nextLeafNode();
            }
            if(last.is('.caret,.caret-start')){
                last = last.previousLeafNode();
            }
            sel.removeCarets();

            // console.log('placing carets at range boundaries', first, last);
            if(first.isBefore(last)){
                $(sel.caretStart).insertBefore(first.firstLeafNode().parent());
                $(sel.caret).insertAfter(last.lastLeafNode().parent());
            } else {
                $(sel.caretStart).insertBefore(last.firstLeafNode().parent());
                $(sel.caret).insertAfter(first.lastLeafNode().parent());
            }
            sel.mark();
            return sel;
        },
        mark: function(){
            var sel = this;
            sel.unmark();
            var start = sel.find('.caret-start');
            var end = sel.find('.caret');
            var temp = false;
            if(end.length === 0){
                return;
            } else if(start.length === 0){
                start = end;
            } else if(end.length && end.isBefore(start)){
                temp = start;
                start = end;
                end = temp;
            }

            var nodes = leafNodesBetween(sel.root, start, end, isSelectable);
            var firstTopNode = start.parentsUntil(sel.root).last().addClass('first-block');
            var lastTopNode = end.parentsUntil(sel.root).last().addClass('last-block');
            var selectedSpan = $('<span>').addClass('selected unwrap');
            firstTopNode.addClass('selected-block');
            if(firstTopNode[0] !== lastTopNode[0]){
                firstTopNode.add(firstTopNode.nextUntil(lastTopNode))
                            .add(lastTopNode)
                            .addClass('selected-block');
            }

            sel.root.children().not('.selected-block').spanify(false);
            $.each(nodes, function(){
                var node = this;
                if(node.nodeType === 3){
                    if(node.parentNode.childNodes.length === 1){
                        // text node that is an only child
                        $(node.parentNode).addClass('selected');
                    } else {
                        $(node).wrap(selectedSpan.clone());
                    }
                } else {
                    // style-able node (e.g. <img>, <hr>)
                    $(node).addClass('selected');
                }
            });

            return sel;
        },
        normalize: function(){
            var rootNode = this.root[0],
                i,
                child;
            /*
                TODO consider lofting non-whitespace text nodes into blocks,
                but they shouldn't be there anyway
            */
            // remove root-level whitespace text nodes as they are very confusing
            for(i = rootNode.childNodes.length - 1; i >= 0; i--){
                child = rootNode.childNodes[i];
                if(child.nodeType === 3 && child.data.match(/^\s*$/)){
                    $(child).remove();
                }
            }
            rootNode.normalize();
            return this;
        }
    };
}(jQuery));
