/*global jQuery*/
/*jshint laxbreak: true */

(function($){
"use strict";

$.fn.makeEditor = function(options){
    this.data('editor', new Editor(this, options));
    // console.log(this, this.data('editor'));
    return this;
};

function deletableFilter(node){
    return node.nodeType !== 3 || node.textContent !== '';
}

function Editor(elt, options){
    this.root = $(elt);
    if(!elt.data().selectable){
        elt.makeSelectable();
    }
    this.selectable = elt.data().selectable;
    this.selectable.caret = '<input class="caret">';
    this.options = $.extend({}, options);

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

Editor.prototype = {
    cssNoSelect: {
        '-webkit-touch-callout': 'none',
        '-webkit-user-select': 'none',
        '-khtml-user-select': 'none',
        '-moz-user-select': 'none',
        '-ms-user-select': 'none',
        'user-select': 'none',
    },
    cssSelect: {
        '-webkit-touch-callout': 'text',
        '-webkit-user-select': 'text',
        '-khtml-user-select': 'text',
        '-moz-user-select': 'text',
        '-ms-user-select': 'text',
        'user-select': 'text',
    },
    setup: function(){
        var editor = this;
        editor.root.attr('tabindex', 0);
        // editor.root.on('mouseup.editor', editor, editor.mouseup);
        editor.root.on('keydown.editor', 'input.caret', editor, editor.keydown);
        editor.root.on('keypress.editor', 'input.caret', editor, editor.keypress);
        editor.root.append($('<p>').append(editor.selectable.caret));
        editor.normalize();

        if(editor.options.tools){
            editor.tools = $(editor.options.tools).on('click.editor', 'button', editor, editor.doCommand)
                                                  .on('change.editor', 'select', editor, editor.doCommand);
        }
        editor.root.on('selectionchanged.editor', function(evt){
            editor.updateUndo('new', 'selectionchanged');
        });
        // TODO -- move this out of here
        editor.root.on('click.editor', '.editor-annotation', function(evt){
            var target = $(evt.target);
            if(target.is('button.delete')){
            } else {
                var text = $(this).closest('.editor-annotation');
            }
            $(evt.target).closest('.editor-annotation').remove();
            editor.updateUndo("new");
        });
        editor.updateUndo("init");
        editor.undoDepth = 0;
    },
    commands: {
        // TODO implement list and table support
        // TODO implement concept of an editor sub-base (e.g. td, th, li, or specified)
        setBlocks: function(newNodeType){
            var editor = this,
                blocks = editor.find('.selected-block');

            blocks.each(function(){
                var newBlock = $('<' + newNodeType + '>').append($(this).contents())
                                                         .addClass('selected-block');
                $(this).replaceWith(newBlock);
            });
        },
        setText: function(attribute, setting){
            var editor = this,
                nodes,
                styledSpan = $('<span>').css(attribute, setting);

            editor.selectable.unmark().root.spanify(false);
            editor.selectable.normalize().mark();
            nodes = editor.selectedLeafNodes();
            $.each(nodes, function(){
                if(this.nodeType === 3 && this.parentNode.childNodes.length === 1){
                    $(this.parentNode).css(attribute, setting);
                } else if(this.nodeType === 3) {
                    $(this).wrap(styledSpan);
                }
            });
            editor.updateUndo("new");
        },
        updateUndo: function(command){
            this.updateUndo(command);
        },
        annotate: function(type){
            var editor = this,
                text = prompt(type || "Annotation");
            if(text){
                var content = $('<span>').append('<span>' + text + '</span>')
                                         .append('<button class="delete">&times;</button>'),
                    annotation = $('<span>').addClass('editor-annotation')
                                            .addClass('noselect')
                                            .addClass(type)
                                            .append(content);
                if(editor.caret.closest('body')){
                    editor.caret.before(annotation);
                } else {
                    $(editor.selectedLeafNodes()[0]).before(annotation);
                }
            }
        }
    },
    /* tool commands */
    doCommand: function(evt){
        var editor = evt.data,
            command = $(this).attr('value') || $(this).val(),
            parameters = command.split(' '),
            fn;

        // console.log(command);
        command = parameters.shift();
        fn = editor.commands[command];
        if(fn){
            fn.apply(editor, parameters);
        } else {
            console.error('unrecognized command', command);
        }
    },
    /* event handlers */
    contentKey: function(key){
        var editor = this;
        if(typeof key === 'number'){
            key = String.fromCharCode(key);
        }
        // TODO track change add
        editor.insertionPoint().before(document.createTextNode(key));
        editor.normalize().updateUndo();
    },
    backspace: function(){
        var editor = this;
        if(!editor.deleteSelection()){
            var insertionPoint = editor.insertionPoint(),
                node = insertionPoint.previousLeafNode(editor.root, deletableFilter),
                caretBlock = editor.block(insertionPoint),
                deletionBlock = editor.block(node);
            if(node.length){
                deletionBlock = editor.block(node);
                node = node[0];
                // TODO track deletion
                // TODO merge paragraphs
                if(node.nodeType === 3 && node.length > 1){
                    node.data = node.data.substr(0, node.length - 1);
                } else {
                    while(node.parentNode.childNodes.length === 1){
                        node = node.parentNode;
                    }
                    $(node).remove();
                    editor.normalize();
                }
                if(
                    $.contains(editor.root[0], deletionBlock[0])
                    && deletionBlock[0] !== caretBlock[0]
                ){
                    caretBlock.detach().contents().appendTo(deletionBlock);
                    editor.find('.caret').focus();
                }
                editor.updateUndo();
            }
        }
    },
    // TODO
    forwardDelete: function(){
    },
    arrowLeft: function(){
    },
    arrowRight: function(){
    },
    arrowUp: function(){
    },
    arrowDown: function(){
    },
    home: function(){
    },
    end: function(){
    },
    splitAtCaret: function(){
        var editor = this;
        if(editor.insertionPoint()){
            var block = editor.block(editor.find('.caret')),
                beforeBlock = block.clone(),
                nodes = block.leafNodes(),
                beforeNodes = beforeBlock.leafNodes(),
                inBeforeBlock = false;
            if(nodes.length !== beforeNodes.length){
                console.error('we are in bizarro world');
            }
            $.each(nodes, function(idx){
                var node = inBeforeBlock ? beforeNodes[idx] : nodes[idx];
                if($(this).is('.caret-start,.caret')){
                    node = beforeNodes[idx];
                    inBeforeBlock = true;
                }
                while(node.parentNode.childNodes.length === 1){
                    node = node.parentNode;
                }
                $(node).remove();
            });
            // beforeBlock.find('.caret-start,.caret').remove();
            beforeBlock.insertBefore(block);
            editor.selectable.mark();
            return true;
        }
    },
    mergeBackAtCaret: function(){
        var editor = this,
            block = editor.block(editor.caret);
        if(previousTextNode(editor.caret[0], block[0], true) === false){
            // at the beginning of a paragraph; merge with previous
            if(block[0].previousSibling){
                block.prev().append(editor.caret).append(block.contents());
                block.remove();
                return true;
            }
        }
        return false;
    },
    mergeForwardAtCaret: function(){
        var editor = this,
            block = editor.block(editor.caret);
        if(nextTextNode(editor.caret[0], block[0], true) === false) {
            // at the end of a paragraph; merge with next
            if(block[0].nextSibling){
                block.next().contents().insertAfter(editor.caret);
                block.remove();
                return true;
            }
        }
        return false;
    },
    keydown: function(evt){
        var editor = evt.data;
        switch(evt.keyCode){
            case 8:
                evt.preventDefault();
                editor.backspace();
                break;
            case 13:
                evt.preventDefault();
                editor.deleteSelection();
                editor.splitAtCaret();
                break;
        }
    },
    keypress: function(evt){
        // console.log('keypress', evt);
        var editor = evt.data;

        // don't process shortcuts (yet!)
        if(evt.ctrlKey || evt.metaKey){
            editor.shortcut(evt);
        } else {
            editor.deleteSelection();

            switch(evt.which){
                case 8:
                case 13:
                    console.error('special key slipped through?', evt.which);
                    break;
                default:
                    editor.contentKey(evt.which);
                    break;
            }
        }
        evt.preventDefault();
        evt.stopPropagation();
    },
    updateUndo: function(command, reason){
        var editor = this;
        if(editor.undo === undefined){
            command = "init";
        }
        if(reason && editor.reasonForLastUndo === reason){
            command = undefined;
        }
        editor.reasonForLastUndo = reason;
        switch(command){
            case "init":
                console.log('initializing undo');
                editor.undo = [editor.root.html()];
                editor.undoDepth = 0;
                break;
            case "new":
                console.log('new undo buffer');
                if(editor.undoDepth){
                    editor.undo = editor.undo.slice(editor.undoDepth);
                    editor.undoDepth = 0;
                }
                editor.undo.unshift( editor.root.html() );
                break;
            case "undo":
                if(editor.undoDepth < editor.undo.length - 1){
                    editor.undoDepth += 1;
                    editor.root.html(editor.undo[this.undoDepth]);
                    editor.find('.caret').focus();
                    console.log('undo', editor.undoDepth);
                }
                break;
            case "redo":
                if(editor.undoDepth > 0){
                    editor.undoDepth -= 1;
                    editor.root.html(editor.undo[this.undoDepth]);
                    editor.find('.caret').focus();
                    console.log('redo', editor.undoDepth);
                }
                break;
            default:
                if(editor.undoDepth || editor.undo.length === 1){
                    console.log('truncating undo stack; new undo buffer');
                    editor.undo = editor.undo.slice(editor.undoDepth);
                    editor.undoDepth = 0;
                    editor.undo.unshift( editor.root.html() );
                } else {
                    console.log('updating first undo buffer');
                    editor.undo[0] = editor.root.html();
                }
        }
        editor.tools.find('[value="updateUndo undo"]')
                    .prop('disabled', editor.undoDepth >= editor.undo.length - 1);
        editor.tools.find('[value="updateUndo redo"]')
                    .prop('disabled', editor.undoDepth === 0);
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
    deleteSelection: function(){
        var editor = this,
            blocks = editor.selectedBlocks(),
            wasAnythingDeleted = false;

        // remove completely selected blocks
        blocks.not('.first-block,.last-block').remove();
        var nodes = editor.selectedLeafNodes();

        if(nodes.length){
            editor.selectable.removeCarets();
            $(editor.selectable.caret).insertAfter(nodes[nodes.length - 1].parentNode)
                                      .focus();

            $.each(nodes, function(){
                var node = this;
                while(node.parentNode.childNodes.length === 1){
                    node = node.parentNode;
                }
                $(node).remove();
            });
            wasAnythingDeleted = true;
        }

        // merge paragraphs
        if(blocks.length > 1){
            blocks.first().detach().contents().prependTo(blocks.last());
            wasAnythingDeleted = true;
        }

        if(blocks.length > 1 || nodes.length){
            editor.updateUndo("new");
        }

        return wasAnythingDeleted;
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
        if( this.root.find('.caret').length ){
            return this.find('.caret-start,.caret').first();
        } else {
            return false;
        }
    },
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
    }
};
}(jQuery));
