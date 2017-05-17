/**
# Editable

Replacement for contenteditable editing.

## Usage

Create an editable element:

    $(selector).makeEditable(options_object);

Retrieve reference to Editable object:

    var editable = $(selector).data().editable;

## Options

{
    tools: tool-container-node OR jQuery-bag-of-nodes
}

The options object will be (shallow) cloned and stored in editable.options.
Use editable.options to store state.

## Tools

You can create tools for the editable very easily using
the editable's doCommand() method. But if you want the editable
to automatically manage tools for you then you can pass tool containers
to the editable:

    $(selector).makeEditable({tools: '.toolbar'});

Example tools:

<pre>
    <button data-shortcut="ctrl+b" value="setText font-weight bold"><b>B</b></button>
    <button data-shortcut="ctrl+b" value="setText vertical-align super font-size 70%"><b>B</b></button>
</pre>

You can even chain multiple commands in a tool by separating them with a semicolon.

data-shortcut lets you provide one or more keyboard shortcuts for a command.
value is the command that is passed to the editable.

A tool can have multiple commands (separated by semicolons).

## Commands

* setText css-property value { property value ... } // styles selected characters
* setBlocks css-property value // styles selected blocks
* updateUndo undo|redo
* setBlockType h1|h2|p|...
* annotate annotationClass // annotates with a clone of .annotation-template .annotationClass

## Annotations

INPUT and TEXTAREA elements within an annotation are automatically serialized.
Any other behavior should be implemented via standard event listeners, etc., ideally
at the editable's root level.

## How Editable Works

The real question is how does Selectable work (see Selectable's documentation).

Editable essentially responds to events and has very good information about
the user selection thanks to selectable, and nice tools for manipulating the
text nodes thanks to the shared utilities.

### Leaf Nodes

All text nodes are **leaf nodes** -- i.e. they cannot themselves have child nodes. Most
leaf nodes in the DOM are probably text nodes. (There are some others, e.g. IMG, INPUT,
and standard nodes that happen to be empty).

So a lot of operations involve finding leaf nodes, moving from one leaf node to
another, and so forth. Unfortunately, text nodes are essentially invisible to
jQuery, so there are a bunch of utility functions (jQuery plugins) in the
shared library for doing this stuff simply and reliably.

(I wrote some simple tests while developing them, but I haven't had time to
write a proper set of unit tests. See tests.html in the github repo.)

### Single Parent Chains

One key concept is **single parent chains**. A single parent chain is the set
of parents of a (text) node that have only one child. When a text node is
deleted you kill its single parent chain.

**Complications** arise when, for example, the selection bounds are in
the chain, so when performing operations on the DOM hierarchy you may want
to remove the bounds (editable.selectable.removeBounds()), do your thing,
and then restore them (editable.selectable.resetBounds()).

More complications can/will arise when you're dealing with tables and lists
which have DOM structures that do not respond well to editing part-way in
their hierarchies. THe key there is not to treat certain elements (TH, TD,
OL, and UL for example) as single parents. (Not implemented yet.) Then you
can handle events in those nodes as you see fit (e.g. cloning the current
line if the user hits enter in a table row or list item, and cleanly deleting
a table row if all its cells are cleared)).

Another thing to note is the use of an input for the .sel-end selection
bound. This is used to trick mobile browsers into disclosing their keyboards,
and has the adventage of being a natural focus target. While the editable
is active its input should have focus -- but it does not grab focus ruthlessly
as this could result in stealing focus in undesired ways.

## Accessibility

Because the input of editable is in fact a focused vanilla input field
it should be easy to make accessible. Whatever you want the document to
"look like" to a screen reader comes down to setting the properties of
editable.find('.caret').

## Extending Editable

Editable is intended to be extensible very easily. The simplest kind of
"extension" is creating custom tools that use existing commands such
as setText and setBlockType.

If you want to add your own commands, simply extend your instance's commands
array. (You can also hack the prototype of course, although right now
Editable isn't exposed for such modification (but it would be easy enough).

Finally, you can simply stick event handlers on the editable.root (putting
them on elements inside is likely to result in losing them, unless you
actively maintain them.

Right now, Editable does not offer a mechanism to get in before one of
its event handlers (such as onWillHandleMouseDown). It would be easy to
add something like this should it be necessary.
*/

/*global jQuery*/
/*jshint laxbreak: true */

(function($){
"use strict";

// private "globals"
var blockSelector = 'h1,h2,h3,h4,h5,h6,pre,blockquote,p,div,ul,ol,th,td',
    modifierKeys = [12,16,17,18,91,92,33,34,35,36,37,38,39,40,91,93],
    nbsp = String.fromCharCode(160),
    // array of editors
    editables = [],
    active_editable = false,
    // see editor-common.js for the control implementation
    editableControls = {},
    paragraph_clipboard = false;

$.fn.makeEditable = function(options){
    this.data('editable', new Editable(this, options));
    return this;
};

function deletableFilter(node){
    node = $(node)[0];
    return !$(node).is('.sel-start,.sel-end')
           && (node.nodeType !== 3 || node.textContent !== '');
}

function whitespaceFilter(node){
    node = $(node)[0];
    return node.nodeType === 3 && node.data.match(/\s/);
}

function textFilter(node){
    node = $(node)[0];
    return node.nodeType === 3 && node.data.match(/\w/);
}

// makes a filter function from an arbitrary input
function makeFilter(filter){
    var fn;
    if(typeof filter === 'function'){
        fn = filter;
    } else if (typeof filter === 'string'){
        fn = function(node){ return $(node).is(filter); };
    } else {
        fn = function(){ return true; };
    }
    return fn;
}

/*
    Utilities to support cut/copy/paste
    Flattens all table content into a document fragment and returns
    the result.
*/
var flattenTable = function (idx, table) {
    var frag = document.createDocumentFragment(),
        br = document.createElement('br'),
        div = document.createElement('div'),
        rows = $('tr', table),
        row,
        cells,
        wrapper,
        i,
        j;

    div.style.display = 'inline-block';
    for (i = 0; i < rows.length; i++) {
        row = $(rows[i]);
        cells = row.children();
        for (j = 0; j < cells.length; j++) {
            wrapper = div.cloneNode();
            wrapper.innerHTML = cells[j].innerHTML;
            frag.appendChild(wrapper);
        }
        frag.appendChild(br.cloneNode());
    }
    return frag;
};

/**
 * recursive helper function to apply styles to nodes.
 */
var mergeFormatHelper = function (nodes, css) {
    var flatTable,
        children,
        table = nodes.filter('table');
    if (table.length) {
        flatTable = table.map(flattenTable);
        mergeFormatHelper($(flatTable), css);
        table.replaceWith(flatTable);
    }
    nodes.css(css);
    children = nodes.children();
    if (children.length) {
        mergeFormatHelper(nodes.children(), css);
    }
};

/**
 * Takes a jquery selection and a css object and applies css properties and values
 * to the elements in the selection recursively.
 */
var mergeFormat = function (nodes, css) {
    var clone = nodes.clone(),
        wrapper = $('<div>').append(clone);
    mergeFormatHelper(wrapper, css);
    return wrapper.children();
};

function selectNodeText( node ){
    var range,
        selection;

    node = $(node).focus().get(0);
    if (!document.createRange) { // MSIE8
        range = document.body.createTextRange();
        range.moveToElementText(node);
        range.select();
    } else if (window.getSelection) { // Others
        range = document.createRange();
        range.selectNodeContents(node);
        selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }
}

/*
    Single parents

    It's all about single parents!

    walk up the chain of filtered parents with only one child
    note that selection bounds can confuse this!

    TODO don't go through TD or LI elements
*/
function topSingleParentAncestor(node, filter){
    filter = makeFilter(filter);
    while(
        node.parentNode
        && node.parentNode.childNodes.length === 1
        && filter(node.parentNode)
    ){
        node = node.parentNode;
    }

    return node;
}

// walk up the chain of parents until one satisfies the filter
function closestSingleParentAncestor(node, filter){
    filter = makeFilter(filter);
    node = node.parentNode;
    while(
        !filter(node)
        && node.parentNode
        && node.parentNode.childNodes.length === 1
    ){
        node = node.parentNode;
    }
    return filter(node) ? node : null;
}

function Editable(elt, options){
    this.root = $(elt);
    this.active = true;
    if(!elt.data().selectable){
        elt.makeSelectable();
    }
    this.selectable = elt.data().selectable;
    this.options = $.extend({}, options);
    this.pastemode = 'merge';

    var defaults = {
    };

    for(var key in defaults){
        if(this.options.key === undefined){
            this.options[key] = defaults[key];
        }
    }

    this.setup();

    return this;
}

function makeCSS(args){
    var css = {};
    if(args.length % 2 === 0){
        for(var i = 0; i < args.length; i+= 2){
            css[args[i]] = args[i+1].replace(/\+/g, ' ');
        }
    } else {
        console.error('Error: expected even number of arguments', args);
        css = null;
    }
    return css;
}

Editable.prototype = {
    cssNoSelect: {
        '-webkit-touch-callout': 'none',
        '-webkit-user-select': 'none',
        '-khtml-user-select': 'none',
        '-moz-user-select': 'none',
        '-ms-user-select': 'none',
        'user-select': 'none'
    },
    cssSelect: {
        '-webkit-touch-callout': 'text',
        '-webkit-user-select': 'text',
        '-khtml-user-select': 'text',
        '-moz-user-select': 'text',
        '-ms-user-select': 'text',
        'user-select': 'text'
    },
    setup: function(){
        var editable = this;
        editable.root.attr('tabindex', 0);
        editable.root.on('keydown.editable', 'input.caret', editable, editable.keydown);
        editable.root.on('keypress.editable', 'input.caret', editable, editable.keypress);
        editable.root.on('copy.editable', 'input.caret', editable, editable.copy);
        editable.root.on('cut.editable', 'input.caret', editable, editable.cut);
        editable.root.on('paste.editable', 'input.caret', editable, editable.paste);
        editable.root.on('click.annotation', '.annotation .delete', function(evt){
            var annotation = $(evt.target).closest('.annotation');
            annotation.find('.annotation-body').remove();
            if(annotation.contents().length){
                annotation.contents().unwrap();
            } else {
                annotation.remove();
            }
        });
        // prevent browser from accidentally navigating away while user hits delete
        $(document).on('keydown', function(evt){
            var blockedKeys = [8];
            if(blockedKeys.indexOf(evt.which) > -1){
                evt.stopPropagation();
                evt.preventDefault();
            }
        });
        // persist changes to the DOM -- note that this should work embedded controls too
        editable.root.on('change.annotation', 'textarea,input,select', function(evt){
            var elt = $(evt.target),
                value = elt.val();
            switch(elt[0].nodeName){
                case "TEXTAREA":
                    elt.text(value);
                    break;
                case "INPUT":
                    // TODO radio buttons and checkboxes
                    elt.attr('value', value);
                    break;
                case "SELECT":
                    elt.find('option').each(function(){
                        var option = $(this);
                        if(option.val() === value){
                            this.setAttribute('selected','');
                        } else {
                            option.removeAttr('selected');
                        }
                    });
                    break;
            }
        });
        editable.root.append($('<p>').append(editable.selectable.bounds()));
        editable.normalize();

        if(editable.options.tools){
            editable.tools = $(editable.options.tools).on('click.editable', 'button', editable, editable.doCommand)
                                                      .on('change.editable', 'select', editable, editable.doCommand);
        }
        editable.root.on('selectionchanged.editable', function(evt){
            editable.updateUndo('new', 'selectionchanged');
        });
        editable.updateUndo("init");
        editable.undoDepth = 0;
        editable.focus();
    },
    focus: function(){
        this.selectable.focus();
        return this;
    },
    commands: {
        // TODO implement list and table support
        // TODO implement concept of an editable sub-base (e.g. td, th, li, or specified)
        setBlockType: function(newNodeType){
            var editable = this,
                blocks = editable.find('.selected-block');

            blocks.each(function(){
                var newBlock = $('<' + newNodeType + '>').append($(this).contents())
                                                         .addClass('selected-block');
                $(this).replaceWith(newBlock);
            });
        },
        setDebug: function() {
            if (this.root[0].classList.contains('debug')) {
                this.root[0].classList.remove('debug');
            } else {
                this.root[0].classList.add('debug');
            }
        },
        setBlocks: function(){
            var css = makeCSS(arguments);
            if(css){
                this.selectedBlocks().css(css);
            }
        },
        setText: function(){
            var editable = this,
                nodes,
                css = makeCSS(arguments),
                styledSpan = $('<span>').addClass('setText');

            // we don't want to wrap every letter so we despan
            editable.selectable.resetBounds().root.spanify(false);
            editable.selectable.markBounds().normalize();
            // now we grab the selected text
            nodes = editable.selectedLeafNodes();
            // and remove the bounds because they ruin the single parent chains
            editable.selectable.removeBounds();
            $.each(nodes, function(){
                // we only want to style text, not image nodes etc.
                if(this.nodeType === 3) {
                    // if possible we want to modify existing setText spans
                    var node = closestSingleParentAncestor(this, '.setText');
                    if(node){
                        $(node).css(css);
                    } else {
                        $(this).wrap(styledSpan.css(css));
                    }
                }
            });
            // our selection is still good, so we just need to restore selection
            editable.selectable.resetBounds().focus();
            // and focus
            editable.updateUndo("new");
        },
        updateUndo: function(command){
            this.updateUndo(command);
        },
        annotate: function(type){
            var editable = this,
                annotationSpan = $('<span>').addClass('annotation do-not-spanify not-selectable not-editable');
            if(editable.insertionPoint()){
                // TODO wrap annotation span around non-empty selection
                annotationSpan.append($('.annotation-template .' + type).clone().addClass('annotation-body'))
                              .insertAfter(editable.insertionPoint());
            }
            editable.updateUndo("new");
        }
    },
    /* tool commands */
    doCommand: function(evt){
        var editable = typeof evt === 'object' ? evt.data : evt,
            data = $(this).attr('value') || $(this).val(),
            commands = data.split(/;\s*/),
            fn;

        // console.log(command);

        while(commands.length){
            var pieces = commands.shift().split(/\s+/),
                command = pieces.shift();
            if(!command){
                continue;
            }
            fn = editable.commands[command];
            if(fn){
                fn.apply(editable, pieces);
            } else {
                console.error('unrecognized command', command);
            }
        }
    },
    /* event handlers */
    contentKey: function(key){
        var editable = this;
        if(typeof key === 'number'){
            key = String.fromCharCode(key);
        }
        // TODO track change add
        editable.insertionPoint().before(document.createTextNode(key));
        editable.normalize().updateUndo();
    },
    backspace: function(){
        var editable = this;
        if(!editable.deleteSelection()){
            var insertionPoint = editable.insertionPoint(),
                node = insertionPoint.previousLeafNode(editable.root, deletableFilter),
                caretBlock = editable.block(insertionPoint),
                deletionBlock = editable.block(node);
            if(node.length){
                deletionBlock = editable.block(node);
                node = node[0];
                // TODO track deletion
                if(node.nodeType === 3 && node.length > 1){
                    node.data = node.data.substr(0, node.length - 1);
                } else {
                    $(topSingleParentAncestor(node)).remove();
                    editable.normalize();
                }
                if(
                    $.contains(editable.root[0], deletionBlock[0])
                    && deletionBlock[0] !== caretBlock[0]
                ){
                    caretBlock.detach().contents().appendTo(deletionBlock);
                    // editable.focus();
                }
                editable.updateUndo();
            }
        }
    },
    // TODO
    forwardDelete: function(){
    },
    moveBoundsBefore: function(target, extendSelection){
        if(!target){
            return;
        }
        var editable = this,
            start = editable.find('.sel-start'),
            end = editable.find('.sel-end');
        target = $(target)[0];
        if(target.data.length > 1){
            target.splitText(target.data.length - 1);
        }
        start.insertBefore(target);
        if(!extendSelection){
            end.insertAfter(start);
        }
        editable.selectable.markBounds();
        editable.focus();
    },
    moveBoundsAfter: function(target, extendSelection){
        if(!target){
            return;
        }
        var editable = this,
            start = editable.find('.sel-start'),
            end = editable.find('.sel-end');
        target = $(target)[0];
        if(target.data.length > 1){
            target.splitText(1);
        }
        end.insertAfter(target);
        if(!extendSelection){
            start.insertBefore(end);
        }
        editable.selectable.markBounds();
        editable.focus();
    },
    arrowLeft: function(evt){
        var editable = this,
            start = editable.find('.sel-start'),
            previous;

        if(evt.altKey){
            previous = start.previousLeafNode(editable.root, whitespaceFilter);
        } else {
            previous = start.previousLeafNode(editable.root, deletableFilter);
        }
        editable.moveBoundsBefore(previous, evt.shiftKey);
    },
    arrowRight: function(evt){
        var editable = this,
            end = editable.find('.sel-end'),
            next;
        if(evt.altKey){
            next = end.nextLeafNode(editable.root, whitespaceFilter);
        } else {
            next = end.nextLeafNode(editable.root, deletableFilter);
        }
        editable.moveBoundsAfter(next, evt.shiftKey);
    },
    arrowUp: function(evt){
        var editable = this,
            start = editable.find('.sel-start'),
            x = start.offset().left,
            y = start.previousLeafNode().parent().offset().top,
            previous;
        if(evt.which === editable.lastKey){
            x = editable.lastCursorX;
        } else {
            editable.lastCursorX = x;
        }
        // need to spanify previous block with text in it.
        editable.block(start).spanify(true).prev().spanify(true);
        previous = start.previousLeafNode(this.root, function(node){
            var parent = node.parent(),
                offset = parent.offset();
            return node[0].nodeType === 3 && offset.top < y - 4 && offset.left + parent.width()/2 < x;
        });
        editable.moveBoundsAfter(previous, evt.shiftKey);
    },
    arrowDown: function(evt){
        var editable = this,
            end = editable.find('.sel-end'),
            x = end.offset().left,
            y = end.nextLeafNode().parent().offset().top,
            next;
        if(evt.which === editable.lastKey){
            x = editable.lastCursorX;
        } else {
            editable.lastCursorX = x;
        }
        // need to spanify next block with text in it.
        editable.block(end).spanify(true).next().spanify(true);
        next = end.nextLeafNode(this.root, function(node){
            var parent = node.parent(),
                offset = parent.offset();
            return node[0].nodeType === 3 && offset.top > y + 4 && offset.left - parent.width()/2 > x;
        });
        editable.moveBoundsBefore(next, evt.shiftKey);
    },
    home: function(){
    },
    end: function(){
    },
    splitAtCaret: function(){
        var editable = this;
        if(editable.insertionPoint()){
            // Should we check the selection is empty?
            var block = editable.block(editable.find('input.caret')),
                beforeBlock = block.clone(),
                nodes = block.leafNodes(),
                beforeNodes = beforeBlock.leafNodes(),
                inBeforeBlock = false;
            if(nodes.length !== beforeNodes.length){
                console.error('we are in bizarro world');
            }
            $.each(nodes, function(idx){
                var node = inBeforeBlock ? beforeNodes[idx] : nodes[idx];
                if($(this).is('.sel-start,.sel-end')){
                    node = beforeNodes[idx];
                    inBeforeBlock = true;
                }
                // move up the chain of nodes that will be empty
                // note that we cannot be starting inside a singleton tag (e.g. input)
                node = topSingleParentAncestor(node, function(node){
                    return node.parentNode
                           && node.parentNode !== editable.root[0];
                });
                $(node).remove();
            });
            beforeBlock.insertBefore(block);
            editable.selectable.markBounds();
            return true;
        }
    },
    keydown: function(evt){
        if($(evt.target).is('.not-editable') || !evt.data.active){
            return;
        }
        var editable = evt.data;
        switch(evt.keyCode){
            case 8: // backspace
                evt.preventDefault();
                editable.backspace();
                break;
            case 13: // enter
                evt.preventDefault();
                editable.deleteSelection();
                editable.splitAtCaret();
                break;
            case 37: // left arrow
                evt.preventDefault();
                editable.arrowLeft(evt);
                break;
            case 38: // up arrow
                evt.preventDefault();
                editable.arrowUp(evt);
                break;
            case 39: // right arrow
                evt.preventDefault();
                editable.arrowRight(evt);
                break;
            case 40: // down arrow;
                evt.preventDefault();
                editable.arrowDown(evt);
                break;
        }
        evt.data.lastKey = evt.which;
    },
    keypress: function(evt){
        // console.log('keypress', evt);
        var editable = evt.data;

        if($(evt.target).is('.not-editable') || !editable.active){
            return;
        }

        // don't process shortcuts (yet!)
        if(evt.ctrlKey || evt.metaKey){
            editable.shortcut(evt);
        } else {
            editable.deleteSelection();

            switch(evt.which){
                case 8:
                case 13:
                    console.error('special key slipped through?', evt.which);
                    break;
                default:
                    editable.contentKey(evt.which);
                    break;
            }
        }
        evt.preventDefault();
        evt.stopPropagation();
    },
    updateUndo: function(command, reason){
        var editable = this;
        if(editable.undo === undefined){
            command = "init";
        }
        if(reason && editable.reasonForLastUndo === reason){
            command = undefined;
        }
        editable.reasonForLastUndo = reason;
        switch(command){
            case "init":
                console.log('initializing undo');
                editable.undo = [editable.root.html()];
                editable.undoDepth = 0;
                break;
            case "new":
                console.log('new undo buffer');
                if(editable.undoDepth){
                    editable.undo = editable.undo.slice(editable.undoDepth);
                    editable.undoDepth = 0;
                }
                editable.undo.unshift( editable.root.html() );
                break;
            case "undo":
                if(editable.undoDepth < editable.undo.length - 1){
                    editable.undoDepth += 1;
                    editable.root.html(editable.undo[this.undoDepth]);
                    editable.focus();
                    console.log('undo', editable.undoDepth);
                }
                break;
            case "redo":
                if(editable.undoDepth > 0){
                    editable.undoDepth -= 1;
                    editable.root.html(editable.undo[this.undoDepth]);
                    editable.focus();
                    console.log('redo', editable.undoDepth);
                }
                break;
            default:
                if(editable.undoDepth || editable.undo.length === 1){
                    console.log('truncating undo stack; new undo buffer');
                    editable.undo = editable.undo.slice(editable.undoDepth);
                    editable.undoDepth = 0;
                    editable.undo.unshift( editable.root.html() );
                } else {
                    console.log('updating first undo buffer');
                    editable.undo[0] = editable.root.html();
                }
        }
        if(editable.tools){
            editable.tools.find('[value="updateUndo undo"]')
                        .prop('disabled', editable.undoDepth >= editable.undo.length - 1);
            editable.tools.find('[value="updateUndo redo"]')
                        .prop('disabled', editable.undoDepth === 0);
        }
        return this;
    },
    shortcut: function(evt){
        console.log('shortcut', evt);

        evt.preventDefault();
        evt.stopPropagation();
    },
    find: function(selector){
        return this.root.find(selector);
    },
    normalize: function(){
        this.selectable.normalize();
        return this;
    },
    // using selection information in the DOM
    // finds all leaf nodes in the selection (these will be elements with
    // no content (e.g. <hr> and <input...> nodes and text nodes)
    selectedLeafNodes: function(){
        return this.find('.selected').leafNodes();
    },
    // scrupulously deletes all selected leaf nodes (and parent nodes left empty)
    // and merges the first and last blocks if the selection spanned multiple blocks
    // returns true if something was deleted
    deleteSelection: function(){
        var editable = this,
            blocks = editable.selectedBlocks(),
            wasAnythingDeleted = false;

        // remove completely selected blocks
        blocks.not('.first-block,.last-block').remove();
        var nodes = editable.selectedLeafNodes();

        if(nodes.length){
            $.each(nodes, function(){
                $(topSingleParentAncestor(this)).remove();
            });
            wasAnythingDeleted = true;
        }

        if(blocks.length > 1){
            // merge paragraphs
            blocks.first().detach().contents().prependTo(blocks.last());
            editable.selectable.markBounds();
            editable.focus();
        } else if (wasAnythingDeleted){
            editable.updateUndo().selectable.selectionChanged();
        }

        return wasAnythingDeleted;
    },
    selectedNodes: function(){
        var editable = this,
            blocks = editable.selectedBlocks().clone();

        function removeUnselected(){
            /* jshint is confused here */
            var nodes = $(this).leafNodes();
            $.each(nodes, function(){
                if($(this).closest('.selected').length === 0){
                    $(topSingleParentAncestor(this)).remove();
                }
            });
        }
        blocks.first().each(removeUnselected);
        if(blocks.length > 1){
            blocks.last().each(removeUnselected);
        }
        return blocks;
    },
    // gets the top level block containing the node
    block: function(node){
        var b = node;
        if($.contains(this.root[0], b[0])){
            while(b.length && b.parent()[0] != this.root[0]){
                b = b.parent();
            }
        } else {
            console.warn('could not find block; bad node?');
            b = false;
        }
        return b;
    },
    // returns the top level blocks containing the selection range
    selectedBlocks: function(){
        return this.find('.selected-block');
    },
    // if the caret is within the root then it is the insertion point
    insertionPoint: function(){
        var caret = this.find('input.caret');
        return caret.length ? caret : false;
    },
    /* TODO fix and make work */
    updateParagraphStyleMenu: function(){
        var menu = this.tools.find('select[name="paragraph-style"]'),
            currentBlockType;
        if(!menu.length){
            return;
        }
        this.selectedBlocks().each(function(){
            if(currentBlockType === undefined){
                currentBlockType = this.nodeName;
            } else if (currentBlockType !== this.nodeName){
                currentBlockType = false;
            }
        });
        if(currentBlockType){
            menu.val('setBlocks ' + currentBlockType.toLowerCase());
        }
    },
    /* editor.js compatibility */
    makeEditable: function(editable){
        this.active = editable;
    },
    setupLinkEditor: function(root, editable){

    },
    ready: function(){
        return true;
    },
    close: function(){
        this.active = false;
        delete(this.root.data().selectable);
        this.root.off('*.editable');
    },
    createAddedSpan: function(evt, afterWhat, content){

    },
    createDeletedSpan: function(evt, selection, replacementText){

    },
    shortcuts: function(evt){
        this.shortcut(evt);
    },
    updateControls: function(){
        return this;
    },
    enable: function(elt, is_enabled){
        // this should be removeProp() and prop() but they don't work?!
        if( is_enabled ){
            elt.removeAttr('disabled');
        } else {
            elt.attr('disabled', 'disabled');
        }
    },
    topLevelElement: function(elt){
        return this.block(elt);
    },
    selection_info: function(){
        console.error('selection_info is deprecated; use editable.find(".selected"|".sel-start"|".sel-end")');
    },
    getSelectionRange: function(){
        return this.find('.selected');
    },
    setSelectionRange: function(range){
        console.error('setSelectionRange gone; use markBounds!');
    },
    execWrapper: function (control, cmdArg){
        console.error('execWrapper gone; use commands directly');
        return this;
    },
    exec: function(command, argument){
        console.error('exec gone; use commands directly');
        return this;
    },
    elementsStyle: function( sel, styleAttribute ){
        var value;
        this.normalize();
        this.find('.selected').each(function(){
            if(value === undefined){
                value = $(this).css('styleAttribute');
            } else {
                if($(this).css('styleAttribute') !== value){
                    value = 'mixed';
                }
            }
        });

        return value || 'mixed';
    },
    blocksStyle: function( sel, styleAttribute ){
        var value;
        this.selectedBlocks().each(function(){
            if(value === undefined){
                value = $(this).css('styleAttribute');
            } else {
                if($(this).css('styleAttribute') !== value){
                    value = 'mixed';
                }
            }
        });
        return value || 'mixed';
    },
    insert: function(nodes, options){
        console.warn('insert is deprecated; use normal DOM manipulation instead');
        options = $.extend({
                where: "insert"
            }, options);
        if( !nodes.length ){
                return;
            }
        switch(options.where){
            case "append":
                this.root.append(nodes);
                break;
            // otherwise
            /* falls through */
            case "insert": // after the editable containing the text insertion point
            case "inline": // after the text insertion point
                this.deleteSelection();
                if(this.insertionPoint()){
                    this.insertionPoint().before(nodes);
                } else {
                    this.root.append(nodes);
                }
                break;
            case "block-insert":
                // inserts content as a block at top level of editor
                $(this.selection_info().blockList.pop()).after(nodes);
                break;
            case "before":
                target = this.find(options.target);
                if( target.length ){
                    target.first().before(nodes);
                } else {
                    this.root.append(nodes);
                }
                break;
            default:
                break;
        }
        this.updateUndo();
        this.selectable.markBounds();
        return nodes;
    },
    change: function(){
        this.updateUndo();
        return this;
    },
    scrollToShow: function(node){
        console.warn('scrollToShow not implemented');
        return this;
    },
    content: function( nodes ){
        if(nodes){
            this.root.empty().append(nodes);
        } else {
            return this.root().contents();
        }
    },
    selectedText: function(){
        var text = '';
        return this.selectedBlocks().each(function(){
            text += $(this).find('.selected').text() + '\n';
        });
    },
    clearMatch: function (node){
        $(node).find('.match').removeClass('match');
    },
    clearMatches: function(){
        this.clearMatch(this.root);
    },
    viewMetricsCache: {},
    viewMetrics: $.noop,
    viewTop: $.noop,
    viewHeight: $.noop,
    viewBottom: $.noop,
    search: function(needle, terms){
        this.replace(needle, null, terms);
    },
    replace: function(needle, replacement, terms){
            this.clearMatches();
            if (''.match(needle) || (needle.constructor !== String && needle.constructor !== RegExp)) {
                return;
            }

            if( typeof needle === 'string' ){
                try {
                    needle = new RegExp( needle, "gi" );
                } catch(e) {
                    alert( "Bad search expression" );
                    return;
                }
            }

            // Recursive DOM walk to highlight needles on content only.
            var highlight = function (node) {
                var skip = 0,
                    idx = 0,
                    textLength,
                    text = node.data,
                    wrapper = $('<span class="match"></span>').get(0),
                    start,
                    clone;
                if (node.nodeType === 3) {
                    //TODO: Look into replacing both search/match with just a single Regex.exec, seems redundant to do two searches.
                    idx = text.search(needle);
                    if (idx >= 0) {
                        textLength = text.match(needle)[0].length;
                        if (typeof replacement === 'string') {
                            node.data = text.replace(needle, replacement);
                        } else {
                            start = node.splitText(idx);
                            start.splitText(textLength);
                            clone = start.cloneNode(true);
                            wrapper.appendChild(clone);
                            start.parentNode.replaceChild(wrapper, start);
                        }
                        skip = 1;
                    }
                } else if (node.nodeType === 1 && node.childNodes) {
                    for (idx = 0; idx < node.childNodes.length; idx += 1) {
                        idx += highlight(node.childNodes[idx]);
                    }
                }
                return skip;
            };

            // TODO: make more eleganter or fix problem at source
            // hack to remove incorrectly nested .editables
            this.find('.editable .editable').removeClass('editable');
            var blocks = this.settings.editableSelector
                ? this.find('.editable')
                : $(this.editor_root);

            $.each( blocks, function( idx, block ) {
                highlight(block);
            });
        },
    clip_trap: function( content ){
        var trap;
        this.savedScrollTop = this.root.scrollTop();
        trap = $("<div/>")
            .attr({contentEditable: true, position: 'absolute', left: 20, top: 20, width: 500})
            .append(content).spanify(false)
            .prependTo(document.body);

        trap.find('.selected,.selected-block,.first-block,.last-block')
            .removeClass('selected selected-block first-block last-block');
        return trap;
    },
    remove_trap: function(trap){
        trap.remove();
        this.savedScrollTop = this.savedScrollTop;
        this.focus();
    },
    isEmail: function(text){
        // jshint is mistaken about this regex
        return text.match(/^(mailto:)?([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,4})$/i);
    },
    isURL: function(text){
        return text.match(/^(http:|https:|mailto:|tel:|ftp:|sftp:)?(\/\/)?(([^\s]+)\.([^\s]{2,}))$/);
    },
    // if it's a mailto, just edit the email address
    // otherwise, if it's http:, leave out the leading characters
    editableURL: function(text){
        var parts = this.isEmail(text);
        if( parts ){
            return parts[2];
        } else {
            parts = this.isURL(text);
            return parts ? (parts[1] === 'http:' ? parts[3] : text) : '';
        }
    },
    // if it's an email address with no mailto, add that
    // otherwise if there's no protocol, assume http:
    clickableURL: function(text){
        var parts = this.isEmail(text),
            url = '';
        if( parts ){
            url = 'mailto:' + parts[2];
        } else {
            parts = this.isURL(text);
            if(parts){
                url = parts[1] ? text : 'http://' + parts[3];
            }
        }
        return url;
    },
    makeLink: function( url, caption ){
        if(!this.isURL(url) && !this.isEmail(url)){
            url = '';
        } else {
            url = this.clickableURL(url);
        }
        caption = caption || this.editableURL(url) || 'Untitled';
        return $('<a>').attr('href', url)
                       .addClass('user-ignored-spellcheck')
                       .append($('<span>').text(caption || url));
    },
    cut: function(evt){
        evt.data.copy(evt, true);
    },
    copy: function(evt, actuallyCut){
        var editable = evt.data,
        trap = editable.clip_trap(editable.selectedNodes());
        selectNodeText(trap);
        setTimeout(function(){
            editable.remove_trap(trap);
            if(actuallyCut){
                editable.deleteSelection();
            }
        });
    },
    paste: function(evt){
        var editable = evt.data;
        if(!editable.active || !$(document.activeElement).is('input.caret')){
            return;
        }

        var pastemode = editable.pastemode,
            paste_trap = editable.clip_trap();
        selectNodeText(paste_trap);
        setTimeout(function(){
            var new_text = $(paste_trap).html(),
                dummyNode,
                nodes,
                css,
                cssAttributes,
                inheritedStyle,
                text,
                attr,
                i;

            // specific hack to cleanup content pasted from pdf.js
            if(new_text.match(/data-font/)){
                // convert divs to spans and add spaces
                new_text = new_text.replace(/(<\/?)div/g, ' $1span');
            }
            dummyNode = $('<div>').html(new_text);
            text = dummyNode.text().trim();

            if (dummyNode.has('.use-paragraph-clipboard').length) {
                pastemode = 'paragraphs';
            // automatically convert urls into link tags
            } else if ( editable.isURL(text) ){
                nodes = editable.makeLink(text);
            // convert email addresses into mailto: links
            } else if ( editable.isEmail(text) ){
                nodes = editable.makeLink( text );
            } else if (pastemode === 'merge') {
                css = {};
                // copying some css attributes from parent
                cssAttributes = [ 'font-family', 'font-size', 'color', 'background-color' ];
                inheritedStyle = getComputedStyle(editable.insertionPoint().parent()[0]);
                for (i = 0; i < cssAttributes.length; i++) {
                    attr = cssAttributes[i];
                    css[attr] = inheritedStyle[attr];
                }
                $.extend(css, {
                    left: '',
                    top: '',
                    position: '',
                    transform: '',
                    whiteSpace: 'normal'
                });
                nodes = mergeFormat(dummyNode, css).contents();
            } else if (pastemode === 'remove') {
                nodes = $(document.createTextNode( text ) );
            } else if (pastemode === 'preserve'){
                nodes = dummyNode.contents();
            }

            console.log(nodes.html());
            editable.remove_trap(paste_trap);

            if( pastemode === 'paragraphs' ){
                editable.insert(paragraph_clipboard.clone(), {where: 'block-insert'});
            } else if (!evt.isDefaultPrevented()) {
                editable.insert(nodes, {where: 'inline'});
            }
        }, 0);
    }
};
}(jQuery));
