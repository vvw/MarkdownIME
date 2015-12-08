if (!window.MarkdownIME) 
window.MarkdownIME = (function(){
var config = {
	"wrapper": "p",	// the default wrapper for plain text line
};

/**
 * Move the cursor to the end of one element.
 * @param {Node} ele
 */
function move_cursor_to_end(ele) {
	var selection = ele.ownerDocument.defaultView.getSelection();
	var range = ele.ownerDocument.createRange();
	var focusNode = ele;
	while (focusNode.nodeType == 1) {
		var t = focusNode.childNodes[focusNode.childNodes.length - 1];
		if (!t) break;
		focusNode = t;
	}
	range.selectNode(focusNode);
	range.collapse(true);
	selection.removeAllRanges();
	selection.addRange(range);
}

/**
 * Check if one node is a container for text line
 * @param {Node} node
 * @returns bool
 */
function is_line_container(node) {
	if (node.nodeType != 1) return false;
	return (/^(P|DIV|LI|H\d)$/.test(node.nodeName));
}

/**
 * Check if one line container can be processed.
 * @param {any} wrapper
 * @returns bool
 */
function is_line_container_clean(wrapper) {
	var ci = wrapper.childNodes.length;
	if (ci == 1 && wrapper.childNodes[0].nodeType == 1) {
		//cracking nuts like <p><i><b>LEGACY</b></i></p>
		return is_line_container_clean(wrapper.childNodes[0]);
	}
	while (ci--) {
		var node = wrapper.childNodes[ci];
		if (node.nodeType == 3) continue;	//textNode pass
		if (node.nodeType == 1 && node.nodeName == "BR") continue; //BR pass
		return false;
	}
	return true;
}

/**
 * Enhance content-editable object(s)
 * @param {HTMLElement} editor The content-editable object
 */
function enhance(editor){
	//Handle array to enhance multi editors.
	if (typeof editor['length'] == "number") {
		[].forEach.call(editor, enhance);
		return;
	}
	
	//Skip bad items
	if (!editor.hasAttribute('contenteditable')) return;
	if (editor.hasAttribute('mdime-enhanced')) return;
	
	var window = editor.ownerDocument.defaultView;
	var document = editor.ownerDocument;
	var selection = window.getSelection();
	var keyHandler = function(ev){
		var keyCode = ev.keyCode || ev.which;
		if (keyCode != 13) return;
		if (ev.shiftKey) return;
		if (ev.ctrlKey) return;

		var range = selection.getRangeAt(0);
		var node = range.startContainer;  //usually this is a text node
		
		var tinyMCE_remove = null; //the bogus node generated by tinyMCE, which will be removed.
		
		if (!range.collapsed) return; 	//avoid working with strange selections
		if (node.nodeType == 1 && /^<br[^>]+bogus[^>]+?\/?>$/.test(node.innerHTML)) {
			//Fix (TinyMCE) Bogus BR
			//NOTE: using innerHTML to avoid making wrong judgement
			//FIXME: get higher listener priority than TinyMCE and stop getting f**ked.
			//focusNode = node.childNodes[0]; //after that we move the cursor to the BR
			console.log('Handle TinyMCE Blank', node);
			// while (!is_line_container(node)) {
			// 	//solving <p><i><code>something...
			// 	node = node.parentNode;
			// 	console.log(' - UpSearch', node);
			// }
			var _node = node.previousSibling;
			if (!_node || _node.nodeName == "UL" || _node.nodeName == "OL") {
				//TinyMCE solved the end of List! Good Job!
				return;
			}
			tinyMCE_remove = node;
			node = _node.childNodes[_node.childNodes.length-1];
			console.log('modified to', node);
		} else if (range.startOffset < node.textContent.trim().length){
			//avoid working with half-break line
			return;
		}
		
		var wrapper = null;
		var parent_tree = [];
		var _iter_node = node;
		while (_iter_node && _iter_node != editor) {
			if (!wrapper && is_line_container(_iter_node)) {
				wrapper = _iter_node;
			}
			parent_tree.push(_iter_node);
			_iter_node = _iter_node.parentNode;
		}
		parent_tree.push(editor);
		if (!wrapper) {
			//No wrapper for the text line. Create one!
			wrapper = document.createElement(config.wrapper || 'div');
			node.parentNode.replaceChild(wrapper, node);
			wrapper.appendChild(node);
		}
		
		if (!is_line_container_clean(wrapper)) {
			//This line is polluted. Do not process.
			return;
		}
		
		if (wrapper.textContent.length == 0) {
			//handle empty lines.
			//TODO: when implementing nested list, rewrite this part.
			
			//console.log('Handle empty line', wrapper, parent_tree);
			
			ev.preventDefault();
			
			var _tagName = config.wrapper || 'div';
			var _dummyNode = document.createElement(_tagName);
			_dummyNode.innerHTML = '<br>';
			
			if (parent_tree[0].nodeName == "BR")
				parent_tree.shift();
			if (parent_tree.length == 1) {
				//the container's first plain line!
				editor.appendChild(_dummyNode);
			} else {
				var _dummyPrevSibling = parent_tree.shift();
				if (_dummyPrevSibling.parentNode.nodeName == "OL" || _dummyPrevSibling.parentNode.nodeName == "UL") {
					//special process for list
					var _t = _dummyPrevSibling.parentNode;
					//sometimes tinyXXX has already removed the blank line
					if (!_dummyPrevSibling.textContent.length)
						_t.removeChild(_dummyPrevSibling);
					_dummyPrevSibling = _t;
				}
				_dummyPrevSibling.parentNode.insertBefore(_dummyNode, _dummyPrevSibling.nextSibling);
			}
			move_cursor_to_end(_dummyNode);
			return;
		}
		
		console.log('Handle', wrapper, parent_tree);
		
		//process the text node
		wrapper = duang(wrapper, wrapper.textContent);
		
		//remove tinyMCE bogus node
		if (tinyMCE_remove)
			tinyMCE_remove.parentNode.removeChild(tinyMCE_remove);
		
		//move the cursor to the end of the wrapper
		//TODO: Refractoring is required, to adapt more situation.
		/*
		//Legacy way
		focusNode = wrapper;
		while (focusNode.childNodes.length) {
			focusNode = focusNode.childNodes[focusNode.childNodes.length - 1];
		}
		*/
		var _tagName = wrapper.nodeName;
		if (!/^(P|DIV|LI)$/.test(_tagName)) _tagName = config.wrapper || 'div';
		var _dummyNode = document.createElement(_tagName);
		_dummyNode.innerHTML = '<br>';
		wrapper.parentNode.insertBefore(_dummyNode, wrapper.nextSibling);
		move_cursor_to_end(_dummyNode);
		ev.preventDefault();
		
		return;
	}
	editor.addEventListener('keydown', keyHandler, false);
	editor.setAttribute('mdime-enhanced', true);
}

/**
 * Duang the text wrapper!
 * @param wrapper 	The original wrapper, which might be replaced/modified.
 * @param text		The text to be procceed.
 * @returns wrapper The new wrapper
 */
function duang(wrapper, text) {
	var window = wrapper.ownerDocument.defaultView;
	var document = wrapper.ownerDocument;
	var r1, r2;
	var new_wrapper;
	//HR Line
	r1 = (text+'   ').match(/^\s*(-\s*|=\s*|\*\s*)(\1{2,})\s*$/);
	if (r1) {
		new_wrapper = document.createElement('hr');
		wrapper.parentNode.replaceChild(new_wrapper, wrapper);
		return new_wrapper;
	}
	//Title replacement
	r1 = text.match(/^(#+)\s*(.+?)\s*\1?$/);
	if (r1) {
		new_wrapper = document.createElement('h'+r1[1].length);
		wrapper.parentNode.replaceChild(new_wrapper, wrapper);
		return duang(new_wrapper, r1[2]);
	}
	//List replacement
	r1 = text.match(/^\s*[-\*]\s+(.+)$/);
	if (r1) {
		new_wrapper = document.createElement('li');
		wrapper.parentNode.replaceChild(new_wrapper, wrapper);
		if (new_wrapper.parentNode.nodeName != "UL") {
			r2 = document.createElement("ul");
			new_wrapper.parentNode.replaceChild(r2, new_wrapper);
			r2.appendChild(new_wrapper);
		}
		return duang(new_wrapper, r1[1]);
	}
	//List(with index) replacement
	r1 = text.match(/^\s*\d+\.\s*(.+)$/);
	if (r1) {
		new_wrapper = document.createElement('li');
		wrapper.parentNode.replaceChild(new_wrapper, wrapper);
		if (new_wrapper.parentNode.nodeName != "OL") {
			r2 = document.createElement("ol");
			new_wrapper.parentNode.replaceChild(r2, new_wrapper);
			r2.appendChild(new_wrapper);
		}
		return duang(new_wrapper, r1[1]);
	}
	//TODO: special input mode entry... like tables and code block
	//Basic replacement
	var html = text.replace(/&/g, '&amp;').replace(/  /g, '&nbsp;&nbsp;').replace(/"/g, '&quot;').replace(/\</g, '&lt;').replace(/\>/g, '&gt;');
	html = html.replace(/\*\*([^\*]+)\*\*/g, '<b>$1</b>');
	html = html.replace(/\*([^\*]+)\*/g, '<i>$1</i>');
	html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
	html = html.replace(/\!\[([^\]]*)\]\(([^\)\s]+)\s+&quot;(.+?)&quot;\)/g, '<img src="$2" title="$3" alt="$1"/>');
	html = html.replace(/\!\[([^\]]*)\]\(([^\)]+)\)/g, '<img src="$2" alt="$1"/>');
	html = html.replace(/\[([^\]]+)\]\(([^\)\s]+)\s+&quot;(.+?)&quot;\)/g, '<a href="$2" title="$3">$1</a>');
	html = html.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2">$1</a>');
	wrapper.innerHTML = html;
	return wrapper;
}

/**
 * Scan the window and modify the editors by calling `enhance()`. This will also affect child-frame.
 * @param {window} window
 * @return {array} editors
 */
function scan(window){
	var doc = window.document;
	var editors;
	
	editors = [].slice.call(doc.querySelectorAll('[contenteditable]'));
	enhance(editors);
	
	[].forEach.call(
		doc.querySelectorAll('iframe'), 
		function(i){
			var result = scan(i.contentWindow);
			if (result.length)
				editors = editors.concat(result);
		}
	);
	
	return editors;
}

/**
 * Enhance every editor and play a animation.
 * This is designed for bookmarklet.
 * @param {window} window
 */
function bookmarklet(window) {
	var editors;
	editors = scan(window);
	[].forEach.call(editors, function(editor) {
		var notifier = editor.ownerDocument.createElement("div");
		var shadowOld = editor.style.boxShadow;
		notifier.textContent = "MarkdownIME Actived!";
		notifier.setAttribute("style", 
			"\
			position: absolute; \
			font-size: 9pt; \
			color: #363; \
			border: 1px solid #363; \
			background: #CFC; \
			padding: 1pt 5pt; \
			border-radius: 0 0 5pt 0; \
			z-index: 32760; \
			transition: opacity .3s ease; \
			opacity: 0; \
			pointer-events: none; \
			");
		editor.parentElement.appendChild(notifier);
		editor.style.boxShadow = "#cfc 0 0 20pt inset , " + shadowOld;
		
		notifier.style.top =  (editor.offsetTop ) + "px";
		notifier.style.left = (editor.offsetLeft) + "px";
		
		setTimeout(function(){
			notifier.style.opacity = 1;
			setTimeout(function() {
				notifier.style.opacity = 0;
				editor.style.boxShadow = shadowOld;
				setTimeout(function() {
					notifier.parentNode.removeChild(notifier);
				}, 500);
			}, 1000);
		}, 100);
	});
}

return {
	config: config,
	scan: scan,
	enhance: enhance,
	prepare: enhance,
	bookmarklet: bookmarklet,
	
	move_cursor_to_end: move_cursor_to_end
}

})();