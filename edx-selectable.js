/**
    # Selectable

    Disables and replaces browser selection behavior
    Selections are marked with *selected* class
    When the user clicks, span.sel-start marks the spot where the mousedown
    occurred, and span.sel-end marks where the selection ended.

    ## How it Works

    Selectable is a result of trying to figure out how to deal with accessibility
    issues and editing on a mobile website (which currently sucks). While
    considering this problem at length I had the revelation that I could figure
    out where every character was on the screen by "spanifying" the text
    nodes in the DOM -- i.e. wrapping a spam around ever single character (if
    necessary). Experimentats quickly showed this was performant.

    In essence, when the user "enters" a child of the selectable it spanifies
    the child and then tracks entry into each span to figure out exactly where
    the selection start/end should go. It places a .sel-start element at the
    initial selection point and a .sel-end element at the end.

    ## Mobile Implementation

    My plan for mobile implementation is to track the user's touch and move
    the selection bounds as though the touch position is about 60px above
    that touch position (creating visual affordances).

    If the user touches the selectable then it inserts and moves the selection-start
    until the user releases (unlike with a mouse -- the selection start moves
    rather than being extended -- unless/until the user is using a "force touch")

    Once the user releases selectable would create an affordance showing the
    beginning and end of the selection and a "grabbable" object at the insertion point
    (I'm thinking a visibly grippy circle below it). The user can extend the
    selection by dragging this affordance OR start a new selection by touching
    somewhere else.

    I believe this will be a much better text-selection experience than is
    offered on any mobile platform natively.

    Finally -- because the insertion-point (.caret) is an input field, a mobile
    browser should be "fooled" into providing a keyboard.

    ## Alternative Implementation of Selectable

    *Break glass in case of performance issues!*

    It occurs to me that there's another way selectable could be implemented, but
    it wouldn't work for mobile. Assuming you don't care about mobile or assume
    that some day mobile browsers won't suck for editing text, you could replace
    the code that figures out where to put the .selStart and .selEnd.caret nodes
    by simply allowing browser selection and then immediately after the selection
    is completed, insert the bounds and mark the selection.

    To do this you'd simply allow selection but as soon as there is a selection
    simply place the bounds elements on the start and end points and then
    calculate the selection yourself.

    This approach will eliminate the use of spanify (the function that wraps
    every letter in a paragraph in its own span, which is at the heart of
    Selectable) but still gives you full control over what gets selected.

    The downside of this approach is the selection will look weird while the
    user is doing it (and won't be stylable). Once it's complete you have nice
    behavior.
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
                    pieces = this.textContent.match(/\s+|\w+|[^\w\s]+/g);
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
            sel.root.on('mousemove.selectable', '*', sel, sel.mousemove)
                    .on('mousedown.selectable', '*', sel, sel.mousedown)
                    .on('mouseup.selectable', '*', sel, sel.mouseup);
            // diagnostic for focus bugs
            /*
            sel.root.on('blur.selectable', 'input', sel, function(){
                        console.warn('caret lost focus');
                    });
            */
        },
        mousemove: function(evt){
            var sel = evt.data,
                elt = $(this);
            if(
                $(evt.target).is('.not-selectable')
                || $(evt.target).closest('.not-selectable').length > 0
            ){
                return;
            }
            elt.spanify(true, true);
            if(sel.selecting && elt.is('.spanified')){
                if((evt.clientX - elt.offset().left) < elt.width() / 2){
                    sel.find('.sel-end').insertBefore(elt);
                } else {
                    sel.find('.sel-end').insertAfter(elt);
                }
                sel.extendSelection();
            }
            evt.preventDefault();
            evt.stopPropagation();
        },
        mousedown: function(evt){
            var sel = evt.data,
                elt = $(this);
            if($(evt.target).is('.not-selectable') || $(evt.target).closest('.not-selectable').length > 0){
                return;
            }
            sel.selecting = evt.originalEvent.detail;
            if(elt.is('.spanified')){
                if(evt.shiftKey){
                    // place selection end
                    if((evt.clientX - elt.offset().left) < elt.width() / 2){
                        sel.find('.sel-end').insertBefore(elt);
                    } else {
                        sel.find('.sel-end').insertAfter(elt);
                    }
                    sel.extendSelection();
                } else if(sel.selecting === 1){
                    // begin selection
                    sel.removeBounds();
                    sel.selecting = 1;
                    if((evt.clientX - elt.offset().left) < elt.width() / 2){
                        sel.bounds().insertBefore(elt);
                    } else {
                        sel.bounds().insertAfter(elt);
                    }
                } else {
                    // change selection mode and extend selection
                    sel.extendSelection();
                }
            }
            evt.preventDefault();
            evt.stopPropagation();
        },
        mouseup: function(evt){
            var sel = evt.data;
            if($(evt.target).is('.not-selectable') || $(evt.target).closest('.not-selectable').length > 0){
                return;
            }
            if(sel.selecting){
                sel.extendSelection();
                sel.selecting = false;
            }
            sel.selectionChanged();
            evt.preventDefault();
            evt.stopPropagation();
        },
        /* Synthetic event triggered by selection change */
        selectionChanged: function(){
            this.focus();
            this.root.trigger('selectionchanged');
            return this;
        },
        focus: function(){
            this.find('.caret').focus();
            return this;
        },
        selStart: '<span class="sel-start"></span>',
        selEnd: '<input class="sel-end caret">',
        markBounds: function(){
            this.markRange(this.find('.sel-start'), this.find('.sel-end'));
            return this;
        },
        bounds: function(){
            return $(this.selStart + this.selEnd);
        },
        // make the bounds match the current selection
        resetBounds: function(){
            var sel = this,
                nodes = sel.find('.selected');
            sel.removeBounds();
            $(sel.selStart).insertBefore(nodes.first().firstLeafNode());
            $(sel.selEnd).insertAfter(nodes.last().lastLeafNode());
            return this;
        },
        removeBounds: function(){
            this.find('.sel-start,.sel-end').remove();
            return this;
        },
        extendSelection: function(){
            var sel = this,
                first = sel.find('.sel-start'),
                last = sel.find('.sel-end');
            switch(sel.selecting){
                case 1:
                    // do nothing
                    break;
                case 2:
                    // word select
                    if(first.closest('.spanified-word').length){
                        first = first.closest('.spanified-word');
                    }
                    if(last.closest('.spanified-word').length){
                        last = last.closest('.spanified-word');
                    }
                    break;
                default:
                    // block select
                    first = first.parentsUntil(sel.root).last();
                    last = last.parentsUntil(sel.root).last();
                    break;
            }
            if(first.length){
                sel.markRange(first, last);
            }
            return this;
        },
        find: function(selector){
            return this.root.find(selector);
        },
        unmark: function(){
            this.find('.selected').removeClass('selected').each(function(){
                // annoyingly jQuery leaves an empty class attribute behind
                if(this.classList.length === 0 && this.getAttribute('class') !== null){
                    this.removeAttribute('class');
                }
            });
            this.find('span').each(function(){
                if(this.attributes.length === 0){
                    $(this).contents().unwrap();
                }
            });
            this.find('.selected-block').removeClass('selected-block');
            this.find('.first-block').removeClass('first-block');
            this.find('.last-block').removeClass('last-block');
            return this;
        },
        isBlock: function(node){
            return $(node)[0].parentNode === this.root[0];
        },
        markRange: function(first, last){
            var sel = this;
            if(first.length === 0){
                console.error('Bad range -- need a selection bound');
                return;
            }
            if(last.length === 0){
                last = first;
            }

            if(last.isBefore(first)){
                var temp = last;
                last = first;
                first = temp;
            }
            sel.unmark();

            // Mark selected blocks
            var firstTopNode = sel.isBlock(first)
                               ? first.addClass('first-block')
                               : first.parentsUntil(sel.root).last().addClass('first-block');
            var lastTopNode = sel.isBlock(last)
                               ? last.addClass('last-block')
                               : last.parentsUntil(sel.root).last().addClass('last-block');
            var blocks;
            // mark block range as selected
            if(firstTopNode[0] === lastTopNode[0]){
                blocks = firstTopNode.addClass('selected-block');
            } else {
                blocks = firstTopNode.add(firstTopNode.nextUntil(lastTopNode))
                                     .add(lastTopNode)
                                     .addClass('selected-block');
            }
            sel.root.children().not('.selected-block').spanify(false);

            // Mark selected leaf nodes
            if(first.is('.sel-start,.sel-end')){
                first = first.nextLeafNode();
            } else {
                first = first.firstLeafNode();
            }
            if(last.is('.sel-start,.sel-end')){
                last = last.previousLeafNode();
            } else {
                last = last.lastLeafNode();
            }
            var nodes = blocks.leafNodes();
            sel.markNode(first);
            sel.markNode(last);
            for(var i = nodes.indexOf(first[0]); i <= nodes.indexOf(last[0]); i++){
                if(first.isBefore(nodes[i]) && $(nodes[i]).isBefore(last)){
                    sel.markNode(nodes[i]);
                }
            }

            return sel;
        },
        markNode: function(node){
            node = $(node)[0];
            if(node.nodeType === 3){
                if(node.parentNode.childNodes.length === 1){
                    // text node that is an only child
                    $(node.parentNode).addClass('selected');
                } else {
                    $(node).wrap($('<span>').addClass('selected'));
                }
            } else {
                // style-able node (e.g. <img>, <hr>)
                $(node).not('.sel-start,.sel-end').addClass('selected');
            }
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
