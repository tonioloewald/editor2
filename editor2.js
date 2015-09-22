/*global jQuery*/

(function($){
  
"use strict";
  
$.fn.editor = function(options){
    this.data('editor', new Editor(this, options));
    // console.log(this, this.data('editor'));
    return this;
};

function Editor(elt, options){
    this.root = $(elt);
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

function allLeafNodes(node){
    var nodeList = [];
    if(node.length && node.nodeType === undefined){
        // jQuery bag of nodes
        $.each(node, function(){
            nodeList = nodeList.concat(allLeafNodes(this));
        });
    } else if(!node.firstChild){
        // leaf node (e.g. text or <hr>
        nodeList.push(node);
    } else {
        // element
        for(var i = 0; i < node.childNodes.length; i++){
            nodeList = nodeList.concat(allLeafNodes(node.childNodes[i]));
        }
    }
    return nodeList;
}

function ensureNonEmpty(nodes){
    $(nodes).each(function(){
        if($(this).contents().length === 0){
            $(this).append(document.createTextNode(""));
        }
    });
}

Editor.prototype = {
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
                var text = $(this).closest('.editor-annotation')
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
                blocks = editor.find('.current');
                
            blocks.each(function(){
                var newBlock = $('<' + newNodeType + '>').append($(this).contents())
                                                           .addClass('current');
                $(this).replaceWith(newBlock);
            });
            
            blocks = editor.find('.current');
            
            // select the entirety of the newly styled blocks
            ensureNonEmpty(blocks.first().add(blocks.last()));
            editor.setSelection([blocks.first().contents()[0], blocks.last().contents().last()[0]]);
        },
        setText: function(className){
            var editor = this,
                nodes = editor.selectedLeafNodes();
            $.each(nodes, function(){
                // console.log(this);
                if(this.nodeType === 3 && this.parentNode.childNodes.length === 1){
                    $(this.parentNode).addClass(className);
                } else if(this.nodeType === 3) {
                    $(this).wrap($('<span>').addClass(className));
                }
            });
            editor.recordSelection(nodes);
        },
        updateUndo: function(command){
            this.updateUndo(command);
        },
        annotate: function(type){
            var editor = this,
                text = prompt(parameters[0] || "Annotation");
            if(text){
                var content = $('<span>').append('<span>' + text + '</span>')
                                         .append('<button class="delete">&times;</button>'),
                    annotation = $('<span>').addClass('editor-annotation')
                                            .addClass('noselect')
                                            .addClass(parameters[0])
                                            .append(content);
                if(editor.caret.closest('body')){
                    editor.caret.before(annotation);
                } else {
                    $(editor.selectedLeafNodes()[0]).before(annotation);
                }
            }
            editor.root.focus();
            editor.recordSelection();
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
    keydown: function(evt){
        var editor = evt.data;
        switch(evt.keyCode){
            case 8:  
                editor.deleteSelection();
                evt.preventDefault();
                break;
            case 13:
                editor.deleteSelection();
                var block = editor.block(editor.caret),
                    before = block.clone(),
                    after = before.clone();
                
                editor.caret.detach();
                
                var nodes = allLeafNodes(after),
                    splitPoint;
                $.each(nodes, function(idx){                
                    if(this.nodeType === 3 && this.parentNode.childNodes.length === 1){
                        $(this.parentNode).remove();
                    } else {
                        $(this).remove();
                    }
                    if($(this).is('.caret')){
                        $(this).remove();
                        splitPoint = idx;
                        return false;
                    }
                });
                
                nodes = allLeafNodes(before);
                $.each(nodes, function(idx){
                    if(idx >= splitPoint){
                        if(this.nodeType === 3 && this.parentNode.childNodes.length === 1){
                            $(this.parentNode).remove();
                        } else {
                            $(this).remove();
                        }
                    }
                });
                
                block.replaceWith(before.add(after));
                ensureNonEmpty(after);
                
                editor.setSelection(function(range){
                    range.setStartBefore(after.contents()[0]);
                    range.setEndBefore(after.contents()[0]);
                });
                
                evt.preventDefault();
        }
    },
    keypress: function(evt){
      	// console.log('keypress', evt);
        var editor = evt.data;
      	
      	// don't process shortcuts (yet!)
      	if(evt.ctrlKey || evt.metaKey){
      	    editor.shortcut(evt);
      	} else {
            if(editor.caret.closest('body').length === 0){
                editor.deleteSelection();
            }
            
            switch(evt.which){
                case 8:
                case 13:
                    console.error('special key slipped through?', evt.which);
                    break;
                default:
                    editor.caret.before(document.createTextNode(String.fromCharCode(evt.which)));
                    editor.normalize();
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
        if(editor.caret.closest('body').length){
            return nodes;
        }
        
        var startNode = editor.nodeFromPath('data-selection-start');
        var endNode = editor.nodeFromPath('data-selection-end');
        
        if(startNode.node === endNode.node){
            nodes.push( startNode.node
                                 .splitText(startNode.offset)
                                 .splitText(endNode.offset - startNode.offset)
                                 .previousSibling
                      );
        } else {
            startNode = startNode.node.splitText(startNode.offset);
            endNode = endNode.node.splitText(endNode.offset).previousSibling;
            
            nodes = allLeafNodes(editor.selectedBlocks());
            
            var start = nodes.indexOf(startNode);
            var end = nodes.indexOf(endNode);
            
            nodes = nodes.splice(start, end - start + 1);
        }

        return nodes;
    },
    // scrupulously deletes all selected leaf nodes (and parent nodes left empty)
    // and merges the first and last blocks if the selection spanned multiple blocks
    deleteSelection: function(){
        var editor = this;
        if(editor.caret.closest('body').length){
            return;
        }
        
        var nodes = editor.selectedLeafNodes();
        if(nodes.length === 0){
            return;
        }
        editor.caret.insertBefore(nodes[0]);
        
        $.each(nodes, function(){ $(this).remove(); });
        
        var blocks = editor.selectedBlocks();
        for(var i = 1; i < blocks.length - 1; i++){
            $(blocks[i]).remove();
        }
        
        // if the selection spanned multiple blocks, merge the first and last
        var first = editor.find('.first-block'),
            last = editor.find('.last-block');
        if(first[0] !== last[0]){
            first.append(editor.caret).append(last.contents());
            last.remove();
        }
        
        // select after the caret
        editor.setSelection([editor.caret[0]]);
    },
    // callback is a function which is passed range as a parameter
    // if an array of nodes is called, it will select from the first to the last
    setSelection: function(callback){
        var editor = this;       
        var range = document.createRange();
        var selection = window.getSelection();
        if(typeof callback === 'function'){
            callback(range);
        } else if (callback.constructor === Array) {
            // console.log(callback[0], callback[callback.length - 1]);
            range.setStartBefore(callback[0]);
            range.setEndAfter(callback.pop());
        }
        selection.removeAllRanges();
        selection.addRange(range);
        this.recordSelection();
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
        var caret = this.find('.caret'),
            blocks;
            
        this.find('.first-block').removeClass('first-block');
        this.find('.last-block').removeClass('last-block');
        if(caret.length){
            blocks = this.block(caret).addClass('first-block last-block');
        } else {
            var first = this.block(this.find('[data-selection-start]')).addClass('first-block');
            var last = this.block(this.find('[data-selection-end]')).addClass('last-block');
            blocks = first.add(first.nextUntil(last.next()));
        }
        return blocks;
    },
    // removes the selection information from the DOM
    forgetSelection: function(){
        this.find('[data-selection-start]').removeAttr('data-selection-start');
        this.find('[data-selection-end]').removeAttr('data-selection-end');
        this.find('.current').removeClass('current');
        this.find('.editor-selection-wrapper').contents().unwrap();
        this.caret.detach();
    },
    // determine a node's position amongst its parent's childNodes
	nodePosition: function(node){
        node = $(node)[0];
        var parent = node.parentNode;
        var position = -1;
        if(parent){
            $.each(parent.childNodes, function(idx){
                if(this === node){
                    position = idx;
                    return false;
                }
            });
        }
        return position;
    },
    // given a selection attribute (e.g. data-selection-start)
    // recovers a selection bound stored using recordSelectionBound
    nodeFromPath: function(pathAttribute){
        var node = this.find('[' + pathAttribute + ']'),
            path = node.attr(pathAttribute)
                       .split(',')
                       .map( function(x){ return parseInt(x, 10); });
        node = node[0];
        while(path.length > 1){
            node = node.childNodes[path.pop()];
        }
        return { node: node, offset: path[0] };
    },
    // restores the selection based on information in the DOM
    restoreSelection: function(){
        var editor = this,
            nodes = editor.selectedLeafNodes();
        editor.setSelection(nodes);
    },
    // stores a selection bound as an offset and node-path
    // e.g. 1,2,3 would mean after character 3 of node.childNodes[1].childNodes[3] 
    // (which will be a text node)
    recordSelectionBound: function(node, attribute, value){
        if(!node){
            return;
        }
        var nodePath = [value];
        node = $(node);
        while(node.length && node[0].parentNode !== this.root[0]){
            nodePath.push( this.nodePosition(node) );
            node = node.parent();
        }
        // console.log(node, attribute, nodePath.join());
        node.attr(attribute, nodePath.join());
    },
    // records selection information into the DOM
    recordSelection: function(){
        this.forgetSelection();
        this.normalize();
        var selection = window.getSelection();
        var range = selection && selection.getRangeAt && selection.rangeCount === 1 && selection.getRangeAt(0);
        if(range.startContainer === range.endContainer && range.startOffset === range.endOffset){
            if(range.startContainer && range.startContainer.splitText){
                $(range.startContainer.splitText(range.startOffset)).before(this.caret);
            } else {
                $(range.startContainer).prepend(this.caret);
            }
        }
        console.log(range.startContainer, range.startOffset, range.endContainer, range.endOffset);
        this.recordSelectionBound(range.startContainer, 'data-selection-start', range.startOffset);
        this.recordSelectionBound(range.endContainer, 'data-selection-end', range.endOffset);
        var currentBlockType;
        this.selectedBlocks().addClass('current').each(function(){
            if(currentBlockType === undefined){
                currentBlockType = this.nodeName;
            } else if (currentBlockType !== this.nodeName){
                currentBlockType = false;
            }
        });
        if(currentBlockType){
            this.tools
                .find('select[name="paragraph-style"]')
                .val('setBlocks ' + currentBlockType.toLowerCase());
        }
        this.updateUndo("new");
    }
};
}(jQuery));