/*global jQuery*/
/*jshint laxbreak: true */

(function($){
"use strict";

$.fn.makeEditable = function(options){
    this.data('editable', new Editable(this, options));
    return this;
};

function deletableFilter(node){
    return node.nodeType !== 3 || node.textContent !== '';
}

function Editable(elt, options){
    this.root = $(elt);
    if(!elt.data().selectable){
        elt.makeSelectable();
    }
    this.selectable = elt.data().selectable;
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
        editable.root.on('click.annotation', '.annotation .delete', function(evt){
            var annotation = $(evt.target).closest('.annotation');
            annotation.find('.annotation-body').remove();
            if(annotation.contents().length){
                annotation.contents().unwrap();
            } else {
                annotation.remove();
            }
        });
        // persist changes to the DOM
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
        this.find('input.caret').focus();
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
        setBlocks: function(attribute, setting){
            this.selectedBlocks().css(attribute, setting);
        },
        setText: function(attribute, setting){
            var editable = this,
                nodes,
                styledSpan = $('<span>').css(attribute, setting);

            editable.selectable.resetBounds().root.spanify(false);
            editable.selectable.normalize().markBounds();
            nodes = editable.selectedLeafNodes();
            $.each(nodes, function(){
                if(this.nodeType === 3 && this.parentNode.childNodes.length === 1){
                    $(this.parentNode).css(attribute, setting);
                } else if(this.nodeType === 3) {
                    $(this).wrap(styledSpan);
                }
            });
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
        var editable = evt.data,
            command = $(this).attr('value') || $(this).val(),
            parameters = command.split(' '),
            fn;

        // console.log(command);
        command = parameters.shift();
        fn = editable.commands[command];
        if(fn){
            fn.apply(editable, parameters);
        } else {
            console.error('unrecognized command', command);
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
                // TODO merge paragraphs
                if(node.nodeType === 3 && node.length > 1){
                    node.data = node.data.substr(0, node.length - 1);
                } else {
                    while(node.parentNode.childNodes.length === 1){
                        node = node.parentNode;
                    }
                    $(node).remove();
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
                while(
                    node.parentNode.parentNode
                    && node.parentNode.parentNode !== editable.root[0]
                    && node.parentNode.childNodes.length === 1
                ){
                    node = node.parentNode;
                }
                $(node).remove();
            });
            beforeBlock.insertBefore(block);
            editable.selectable.markBounds();
            return true;
        }
    },
    keydown: function(evt){
        if($(evt.target).is('.not-editable')){
            return;
        }
        var editable = evt.data;
        switch(evt.keyCode){
            case 8:
                evt.preventDefault();
                editable.backspace();
                break;
            case 13:
                evt.preventDefault();
                editable.deleteSelection();
                editable.splitAtCaret();
                break;
        }
    },
    keypress: function(evt){
        if($(evt.target).is('.not-editable')){
            return;
        }
        // console.log('keypress', evt);
        var editable = evt.data;

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
        editable.tools.find('[value="updateUndo undo"]')
                    .prop('disabled', editable.undoDepth >= editable.undo.length - 1);
        editable.tools.find('[value="updateUndo redo"]')
                    .prop('disabled', editable.undoDepth === 0);
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
                var node = this;
                while(node.parentNode.childNodes.length === 1){
                    node = node.parentNode;
                }
                $(node).remove();
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
