/*global jQuery*/

(function($){
  
"use strict";
  
$.fn.makeEditor = function(options){
    this.data('editor', new Editor(this, options));
    // console.log(this, this.data('editor'));
    return this;
};

function Editor(elt, options){
    this.root = $(elt);
    if(elt.data().selectable){
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
        editor.root.on('mouseup.editor', editor, editor.mouseup);
        editor.root.on('keydown.editor', editor, editor.keydown);
        editor.root.on('keypress.editor', editor, editor.keypress);
        
        editor.caret = $('<span>').addClass('caret');
        var lastBlock = editor.block(editor.root.contents().last());
        
        if(lastBlock.length){
            lastBlock.append(editor.caret);
        } else {
            editor.root.append($('<p>').append(editor.caret));
        }
        
        if(editor.options.tools){
            editor.tools = $(editor.options.tools).on('click.editor', 'button', editor, editor.doCommand)
                                                  .on('change.editor', 'select', editor, editor.doCommand);
        }
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
        setBlocks: function(newNodeType){
            var editor = this,
                blocks = editor.find('.selected-block');
                
            blocks.each(function(){
                var newBlock = $('<' + newNodeType + '>').append($(this).contents())
                                                           .addClass('selected-block');
                $(this).replaceWith(newBlock);
            });
            
            blocks = editor.find('.selected-block');
            editor.selectable.markRange(blocks.first(), blocks.last());
            
            /*
                TO DO
                verify this is not needed
                // select the entirety of the newly styled blocks
                ensureNonEmpty(blocks.first().add(blocks.last()));
            /* 
                TO DO replace this:
                editor.setSelection([blocks.first().contents()[0], blocks.last().contents().last()[0]]);
            */
        },
        setText: function(className){
            var editor = this,
                nodes = editor.selectedLeafNodes();
            $.each(nodes, function(){
                // console.log(this);
                if(this.nodeType === 3 && this.parentNode.childNodes.length === 1){
                    $(this.parentNode).addClass(className)
                                      .addClass('editor-selected');
                } else if(this.nodeType === 3) {
                    $(this).wrap($('<span>').addClass(className)
                                            .addClass('editor-selected'));
                }
            });
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
            editor.root.focus();
            editor.recordSelection(true);
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
    mouseup: function(evt){
        // console.log('mouseup', evt);
        var editor = evt.data;
        editor.recordSelection();
    },
    contentKey: function(key){
        var editor = this;
        if(typeof key === 'number'){
            key = String.fromCharCode(key);
        }
        editor.caret.before(document.createTextNode(key));
        editor.normalize();
    },
    backspace: function(){
        var editor = this;
        if(editor.insertionPoint()){
            var block = editor.block(editor.caret),
                textNode = previousTextNode(editor.caret[0], block[0], true);
            if(textNode){
                var text = textNode.textContent;
                text = text.substr(0, text.length - 1);
                textNode.nodeValue = text;
            } else {
                editor.mergeBackAtCaret();
            }
            editor.updateUndo();
        } else {
            editor.deleteSelection();
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
            var block = editor.block(editor.caret),
                beforeBlock = block.clone(),
                nodes = block.leafNodes(),
                beforeNodes = beforeBlock.leafNodes(),
                inBeforeBlock = false;
            if(nodes.length !== beforeNodes.length){
                console.error('we are in bizarro world');
            }
            $.each(nodes, function(idx){
                var node = inBeforeBlock ? beforeNodes[idx] : nodes[idx];
                if(this === editor.caret[0]){
                    node = beforeNodes[idx];
                    inBeforeBlock = true;
                }
                $(node).remove();
            });
            beforeBlock.insertBefore(block);
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
                if(editor.insertionPoint()){
                    editor.splitAtCaret();
                } else {
                    editor.deleteSelection();
                    editor.splitAtCaret();
                }
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
            if(!editor.insertionPoint()){
                editor.deleteSelection();
            }
            
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
        editor.updateUndo();
        
        evt.preventDefault();
        evt.stopPropagation();
    },
    updateUndo: function(command){
        var editor = this;
        if(editor.undo === undefined){
            command = "init";
        }
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
                    console.log('undo', editor.undoDepth);
                }
                break;
          case "redo":
                if(editor.undoDepth > 0){
                    editor.undoDepth -= 1;
                    editor.root.html(editor.undo[this.undoDepth]);
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
        this.root[0].normalize();
    },
    // using selection information in the DOM
    // finds all leaf nodes in the selection (these will be elements with
    // no content (e.g. <hr> and <input...> nodes and text nodes)
    selectedLeafNodes: function(){
        var editor = this;
        var nodes = [];
        // TODO
    },
    // scrupulously deletes all selected leaf nodes (and parent nodes left empty)
    // and merges the first and last blocks if the selection spanned multiple blocks
    deleteSelection: function(){
        var editor = this;
        if(editor.insertionPoint()){
            return;
        }
        
        var nodes = editor.selectedLeafNodes();
        if(nodes.length === 0){
            return;
        }
        var blocks = editor.selectedBlocks();
        
        editor.caret.insertAfter(nodes[nodes.length - 1]);
        $.each(nodes, function(){ $(this).remove(); });
        if(blocks.length > 1){
            for(var i = 1; i < blocks.length - 1; i++){
                $(blocks[i]).remove();
            }
            // blocks.last().prepend(editor.caret);
            editor.mergeBackAtCaret();
        }
        editor.forgetSelection(true);
        editor.updateUndo("new");
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
        /* TODO */
    },
    // if the caret is within the root then it is the insertion point
    insertionPoint: function(){
        return !!editor.root.find('.caret').length;
    },
    updateParagraphStyleMenu: function(){
        var menu = this.tools.find('select[name="paragraph-style"]'),
           .selected-blockBlockType;
        if(!menu.length){
            return;
        }
        this.selectedBlocks().addClass(.selected-block').each(function(){
            if.selected-blockBlockType === undefined){
               .selected-blockBlockType = this.nodeName;
            } else if .selected-blockBlockType !== this.nodeName){
               .selected-blockBlockType = false;
            }
        });
        if.selected-blockBlockType){
            menu.val('setBlocks ' +.selected-blockBlockType.toLowerCase());
        }
    }
};
}(jQuery));