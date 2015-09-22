/*global jQuery*/

(function($){
  
"use strict";
  
$.fn.editor = function(options){
    this.data('editor', new Editor(this, options));
    // console.log(this, this.data('editor'));
    return this;
};

/*
var cssNoSelect = {
    '-webkit-touch-callout': 'none',
    '-webkit-user-select': 'none',
    '-khtml-user-select': 'none',
    '-moz-user-select': 'none',
    '-ms-user-select': 'none',
    'user-select': 'none',
};

var cssSelect = {
    '-webkit-touch-callout': 'text',
    '-webkit-user-select': 'text',
    '-khtml-user-select': 'text',
    '-moz-user-select': 'text',
    '-ms-user-select': 'text',
    'user-select': 'text',
};
*/

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

/*
    DOM traversal utilities
*/
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

function previousTextNode(node, base, cleanup){
	if(!base){
        base = document;
    }
    if(!cleanup){
        cleanup = false;
    } else {
        cleanup = [];
    }
    node = $(node)[0];
    var path = [node];
	do {
	    if(cleanup && node.nodeType === 3 && node.textContent.trim().length === 0){
	        cleanup.push(node);
	    }
        if(node.previousSibling){
            node = node.previousSibling;
            path.push(node);
            while ( node.firstChild ){
                node = node.childNodes[node.childNodes.length -1];
            	path.push(node);
            }
        } else if( node.parentNode === base ){
            node = false;
            path.push(node);
            break;
        } else {
            node = node.parentNode;
            path.push(node);
        }
    } while (node.nodeType !== 3 || node.textContent.trim().length === 0 );
    if(cleanup.length){
        $.each(cleanup, function(){ $(this).remove(); });
        if(node.nodeType === 3){
            node.nodeValue = node.textContent + " ";
        }
    }
    // console.log(path);
    return node;
}

// TODO
function nextTextNode(){
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
                nodes = allLeafNodes(block),
                beforeNodes = allLeafNodes(beforeBlock),
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
        if(editor.insertionPoint()){
            return nodes;
        }
        
        var startNode = editor.nodeFromPath('data-selection-start');
        var endNode = editor.nodeFromPath('data-selection-end');
        
        var lastDitchSelection = editor.find('.editor-selected');
        if(lastDitchSelection.length){
            return allLeafNodes(lastDitchSelection);
        }
        
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
        if(editor.insertionPoint()){
            return;
        }
        
        var nodes = editor.selectedLeafNodes();
        if(nodes.length === 0){
            return;
        }
        
        $.each(nodes, function(){ $(this).remove(); });
        var blocks = editor.selectedBlocks();
        for(var i = 1; i < blocks.length - 1; i++){
            $(blocks[i]).remove();
        }
        blocks.last().prepend(editor.caret);
        editor.mergeBackAtCaret();
        editor.forgetSelection(true);
        editor.updateUndo("new");
    },
    // callback is a function which is passed range as a parameter
    // if an array of nodes is called, it will select from the first to the last
    setSelection: function(callback){
        var editor = this;       
        var range = document.createRange();
        var selection = window.getSelection();
        selection.empty();
        if(typeof callback === 'function'){
            callback(range);
        } else if (callback.constructor === Array) {
            // console.log(callback[0], callback[callback.length - 1]);
            range.setStartBefore(callback[0]);
            range.setEndAfter(callback.pop());
        }
        selection.removeAllRanges();
        selection.addRange(range);
        this.recordSelection(true);
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
    forgetSelection: function(keepCaret){
        // this.root.css(cssNoSelect);
        this.find('[data-selection-start]').removeAttr('data-selection-start');
        this.find('[data-selection-end]').removeAttr('data-selection-end');
        this.find('.current').removeClass('current');
        this.find('.editor-selected').removeClass('editor-selected');
        this.find('.editor-selection-wrapper').contents().unwrap();
        if(keepCaret){
            window.getSelection().empty();
        } else {
            this.find('.caret').detach();
        }
        // this.root.css(cssSelect);
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
    // if the caret is within the root then it is the insertion point
    insertionPoint: function(){
        if( $.contains(this.root[0], this.caret[0]) ){
            return true;
        } else {
            return false;
        }
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
    updateParagraphStyleMenu: function(){
        var menu = this.tools.find('select[name="paragraph-style"]'),
            currentBlockType;
        if(!menu.length){
            return;
        }
        this.selectedBlocks().addClass('current').each(function(){
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
    // records selection information into the DOM
    recordSelection: function(keepCaret){
        this.forgetSelection(keepCaret);
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
        this.recordSelectionBound(range.startContainer, 'data-selection-start', range.startOffset);
        this.recordSelectionBound(range.endContainer, 'data-selection-end', range.endOffset);
        this.updateParagraphStyleMenu();
        this.updateUndo("new");
    }
};
}(jQuery));