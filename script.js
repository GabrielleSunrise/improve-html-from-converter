const inputTextArea = document.getElementById('inputHtml');
const outputDiv = document.getElementById('outputCleaned');
let historyStack = [];
const maxHistory = 50;
let searchResults = [];
let currentSearchIdx = -1;

function escapeHtml(text) {
    return text.replace(/&/g, '\x26amp;')
        .replace(/</g, '\x26lt;')
        .replace(/>/g, '\x26gt;')
        .replace(/"/g, '\x26quot;')
        .replace(/'/g, '\x26#039;');
}

function highlight(text) {
    let html = escapeHtml(text);
    const query = document.getElementById('searchInput').value;

    if (query && query.length > 0) {
        const escapedQuery = escapeHtml(query);
        const re = new RegExp(escapedQuery.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
        let matchIndex = 0;

        html = html.replace(re, (match) => {
            const isCurrent = (matchIndex === currentSearchIdx);
            matchIndex++;
            const className = isCurrent ? 'search-hl current' : 'search-hl';
            return '<span class="' + className + '">' + match + '</span>';
        });
    }

    html = html.replace(/(\x26lt;strong\x26gt;)([\s\S]*?)(\x26lt;\/strong\x26gt;)/gi, '$1<span class="hl-bold">$2</span>$3');
    html = html.replace(/(\x26lt;\/?[a-z1-6]+[\s\S]*?\x26gt;)/gi, '<span class="hl-tag">$1</span>');
    html = html.replace(/(\s+)([a-z-]+)(=\x26quot;[\s\S]*?\x26quot;)/gi, '$1<span class="hl-attr">$2</span>$3');
    return html;
}

function updateView() {
    const text = outputDiv.innerText;
    const isEditorFocused = document.activeElement === outputDiv;
    if (isEditorFocused) {
        const caretPos = getCaretPosition(outputDiv);
        outputDiv.innerHTML = highlight(text);
        restoreCaretPosition(outputDiv, caretPos);
    } else {
        outputDiv.innerHTML = highlight(text);
    }
}

function getCaretPosition(element) {
    let position = 0;
    const selection = window.getSelection();
    if (selection.rangeCount !== 0) {
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(element);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        position = preCaretRange.toString().length;
    }
    return position;
}

function restoreCaretPosition(element, position) {
    let charCount = 0;
    let range = document.createRange();
    range.setStart(element, 0);
    range.collapse(true);
    let nodeStack = [element];
    let node, found = false, stop = false;
    while (!stop && (node = nodeStack.pop())) {
        if (node.nodeType === 3) {
            let nextCharCount = charCount + node.length;
            if (!found && position <= nextCharCount) {
                range.setStart(node, position - charCount);
                range.setEnd(node, position - charCount);
                found = true;
                stop = true;
            }
            charCount = nextCharCount;
        } else {
            let i = node.childNodes.length;
            while (i--) { nodeStack.push(node.childNodes[i]); }
        }
    }
    let selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

function saveState() {
    const currentText = outputDiv.innerText;
    if (historyStack.length > 0 && historyStack[historyStack.length - 1] === currentText) return;
    historyStack.push(currentText);
    if (historyStack.length > maxHistory) historyStack.shift();
}

function undo() {
    if (historyStack.length <= 1) return;
    historyStack.pop();
    const prevState = historyStack[historyStack.length - 1];
    outputDiv.innerText = prevState;
    updateView();
}

inputTextArea.addEventListener('paste', function(e) {
    e.preventDefault();
    let html = (e.clipboardData || window.clipboardData).getData('text/html');
    if (html) {
        this.value = html;
    } else {
        let text = (e.clipboardData || window.clipboardData).getData('text/plain');
        this.value = text;
    }
});

function cleanHTML(htmlInput) {
    let rawHtml = htmlInput.replace(/\u200B/g, '').replace(/<!--[\s\S]*?-->/g, '');
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    const body = doc.body;

    body.querySelectorAll('meta, link, style, script, title, iframe, object, embed, svg, form, input, button').forEach(el => el.remove());

    const allSpans = body.querySelectorAll('span');
    allSpans.forEach(span => {
        const style = span.getAttribute('style') || '';
        let content = span.innerHTML;
        if (style.includes('font-weight:700') || style.includes('font-weight:bold')) {
            content = '<strong>' + content + '</strong>';
        }
        if (style.includes('font-style:italic')) {
            content = '<em>' + content + '</em>';
        }
        if (content !== span.innerHTML) span.innerHTML = content;
    });

    const allElements = body.querySelectorAll('*');
    allElements.forEach(el => {
        const tagName = el.tagName.toUpperCase();

        const attributes = [...el.attributes];
        attributes.forEach(attr => {
            if (attr.name.startsWith('on')) {
                el.removeAttribute(attr.name);
                return;
            }

            const isHref = (tagName === 'A' && attr.name === 'href');
            const isSrc = (tagName === 'IMG' && (attr.name === 'src' || attr.name === 'alt'));

            if (isHref) {
                const val = attr.value.trim().toLowerCase();
                if (val.startsWith('javascript:') || val.startsWith('data:') || val.startsWith('vbscript:')) {
                    el.setAttribute('href', '#');
                }
            }

            if (!isHref && !isSrc) el.removeAttribute(attr.name);
        });

        if (tagName === 'A') {
            let href = el.getAttribute('href');
            if (href && href.includes('://google.com')) {
                try {
                    const urlObj = new URL(href);
                    const actualUrl = urlObj.searchParams.get('q');
                    if (actualUrl) el.setAttribute('href', actualUrl);
                } catch (e) {}
            }
        }
    });

    const fonts = body.querySelectorAll('font');
    fonts.forEach(el => {
        el.replaceWith(...el.childNodes);
    });

    const wrappers = body.querySelectorAll('span, b, strong, em, i');
    wrappers.forEach(el => {
        const hasBlock = el.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, li, div');
        if (el.tagName === 'SPAN' || el.tagName === 'FONT' || hasBlock) {
            el.replaceWith(...el.childNodes);
        }
    });

    const allParagraphs = body.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6');
    allParagraphs.forEach(el => {
        const cleanContent = el.innerHTML.replace(/<br\s*\/?>/gi, '').trim();
        if (cleanContent === '') {
            el.remove();
        }
    });

    const blocks = body.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6');
    blocks.forEach(el => {
        const internalP = el.querySelectorAll('p');
        internalP.forEach(p => p.replaceWith(...p.childNodes));
        el.innerHTML = el.innerHTML.trim();
    });

    let result = body.innerHTML;
    result = result.replace(/\r?\n|\r/g, ' ');
    result = result.replace(/\s\s+/g, ' ');

    ['ul', 'ol', 'li', 'table', 'tr'].forEach(tag => {
        result = result.replace(new RegExp('<' + tag + '>', 'gi'), '<' + tag + '>\n');
    });
    ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'tr', 'div'].forEach(tag => {
        result = result.split('</' + tag + '>').join('</' + tag + '>\n');
    });

    result = result.replace(/(<img[^>]*>)/gi, '$1\n');
    result = result.replace(/^\s+/gm, '');
    result = result.replace(/\n\s*\n/g, '\n').replace(/<br\s*\/?>\s*$/gi, '');

    return result.trim();
}

document.getElementById('fromGoogleDocs').addEventListener('click', function() {
    const sourceText = inputTextArea.value;
    let cleanStructure = cleanHTML(sourceText);
    let finalHtml = cleanWordHtml(cleanStructure);
    outputDiv.innerText = finalHtml;
    updateView();
    saveState();
});

function cleanWordHtml(html) {
    let result = html;
    result = result.replace(/(<[^>]+>)|([^<]+)/g, function(match, tag, text) {
        if (tag) return tag;
        let t = text;
        t = t.replace(/(^|[\s(\[<{])["\u201c]/g, '$1\u00ab');
        t = t.replace(/["\u201d]/g, '\u00bb');
        t = t.replace(/(^|[\s(\[<{])['\u2018]/g, '$1\u00ab');
        t = t.replace(/['\u2019]/g, '\u00bb');
        return t;
    });

    result = result.replace(/&ndash;|&mdash;/g, '\u2014');
    result = result.replace(/&laquo;|&ldquor;|&lsquor;|&ldquo;/g, '\u00ab');
    result = result.replace(/&raquo;|&rdquor;|&rsquor;|&rdquo;/g, '\u00bb');
    result = result.replace(/&hellip;/g, '...');
    result = result.replace(/(?:&nbsp;|\s){2,}/g, ' ');
    result = result.replace(/&nbsp;/g, ' ');
    result = result.replace(/\u00ab<strong>/g, '<strong>\u00ab');
    result = result.replace(/<\/strong>\u00bb/g, '\u00bb<\/strong>');
    result = result.replace(/<h1/g, '<h2').replace(/<\/h1>/g, '<\/h2>');
    return result;
}

document.getElementById('cleanButton').addEventListener('click', function() {
    const currentText = outputDiv.innerText.trim();
    const sourceText = currentText !== "" ? currentText : inputTextArea.value;
    const cleanedText = cleanWordHtml(sourceText);
    outputDiv.innerText = cleanedText;
    updateView();
    saveState();
});

function insertImageBlock() {
    const imgTemplate = '\n<p>\n  <img src="" alt="">\n</p>\n';
    insertTextAtCaret(imgTemplate);
}

function insertImageDiv() {
    const imgTemplate = '\n<div>\n  <img src="" alt="">\n</div>\n';
    insertTextAtCaret(imgTemplate);
}

function insertTextAtCaret(newText) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    if (!outputDiv.contains(range.commonAncestorContainer)) {
        alert("Установите курсор в поле результата или выделите текст");
        return;
    }

    saveState();

    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', newText);

    const event = new ClipboardEvent('paste', {
        clipboardData: dataTransfer,
        bubbles: true,
        cancelable: true
    });

    const originalPasteHandler = outputDiv.onpaste;
    outputDiv.setAttribute('data-internal-insert', 'true');

    range.deleteContents();
    const textNode = document.createTextNode(newText);
    range.insertNode(textNode);

    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);

    outputDiv.removeAttribute('data-internal-insert');
    updateView();
    saveState();
}

function replaceSelectionWithText(newText) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!outputDiv.contains(range.commonAncestorContainer)) {
        alert("Установите курсор в место вставки картинки в поле результата");
        return;
    }
    saveState();
    const activeRange = selection.getRangeAt(0);
    activeRange.deleteContents();
    const textNode = document.createTextNode(newText);
    activeRange.insertNode(textNode);
    activeRange.setStartAfter(textNode);
    activeRange.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(activeRange);
    updateView();
    saveState();
}

function removeSelectedTagGlobally() {
    const selection = window.getSelection();
    let selectedText = selection.toString().trim();

    const tagMatch = selectedText.match(/<\/??([a-z1-6]+)/i);
    if (!tagMatch) {
        alert("В выделенном фрагменте не найдено ни одного тега.");
        return;
    }
    const tagName = tagMatch[1].toLowerCase();

    saveState();
    let currentHtml = outputDiv.innerText;

    const openingTagRegex = new RegExp('<' + tagName + '(\\s+[^>]*?)?>', 'gi');
    const closingTagRegex = new RegExp('</' + tagName + '>', 'gi');
    const selfClosingRegex = new RegExp('<' + tagName + '(\\s+[^>]*?)?/>', 'gi');

    const newHtml = currentHtml
        .replace(openingTagRegex, '')
        .replace(closingTagRegex, '')
        .replace(selfClosingRegex, '');

    outputDiv.innerText = newHtml;
    updateView();
    saveState();
}

function setHeading(level) {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.toString().trim() === "") {
        alert("Выделите текст");
        return;
    }
    let selectedText = selection.toString().trim();
    if (!selectedText.startsWith('<') || !selectedText.endsWith('>')) {
        alert("Нужно выделить строку целиком, вместе с тегами.\n\nНапример:\nВаш текст");
        return;
    }
    saveState();
    const targetTag = 'h' + level;
    selectedText = selectedText.replace(/<(?:p|h[1-6]|div)[^>]*>([\s\S]*?)<\/(?:p|h[1-6]|div)>/gi, '$1');
    selectedText = selectedText.replace(/^<\/?[a-z1-6]+[^>]*>/i, '').replace(/<\/?[a-z1-6]+[^>]*>$/i, '');
    const text = outputDiv.innerText;
    const startIdx = getCaretPosition(outputDiv);
    const endIdx = startIdx + selection.toString().length;
    const leftText = text.substring(0, startIdx);
    const rightText = text.substring(endIdx);
    const tagStart = leftText.lastIndexOf('<');
    const tagEndRel = rightText.indexOf('>');
    const tagEnd = tagEndRel !== -1 ? endIdx + tagEndRel + 1 : -1;
    let surroundingTagMatch = leftText.substring(tagStart).match(/^<([a-z1-6]+)/i);
    let parentTagName = surroundingTagMatch ? surroundingTagMatch[1].toLowerCase() : null;
    if (selection.toString().trim().match(/^<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>$/i)) {
        const newHeader = '<' + targetTag + '>' + selectedText + '</' + targetTag + '>';
        replaceSelectionWithText(newHeader);
    } else if (parentTagName && /^h[1-6]$/.test(parentTagName)) {
        const fullHeaderStart = tagStart;
        const fullHeaderEnd = text.indexOf('</' + parentTagName + '>', startIdx) + parentTagName.length + 3;
        const oldHeaderText = text.substring(fullHeaderStart, fullHeaderEnd).replace(/<[^>]+>/g, '');
        const newHeader = '<' + targetTag + '>' + oldHeaderText + '</' + targetTag + '>';
        setSelectionRange(outputDiv, fullHeaderStart, fullHeaderEnd);
        replaceSelectionWithText(newHeader);
    } else if (parentTagName === 'p' || parentTagName === 'li' || parentTagName === 'div') {
        const pCloseIdx = text.indexOf('</' + parentTagName + '>', startIdx);
        const textBefore = text.substring(tagStart, startIdx);
        const textAfter = text.substring(endIdx, pCloseIdx + parentTagName.length + 3);
        let result = "";
        if (textBefore.includes('>') && textBefore.split('>')[1].trim() !== "") {
            result += textBefore + '</' + parentTagName + '>\n';
        }
        result += '<' + targetTag + '>' + selectedText + '</' + targetTag + '>';
        const afterContent = textAfter.substring(0, textAfter.lastIndexOf('<'));
        if (afterContent.trim() !== "") {
            result += '\n<' + parentTagName + '>' + afterContent + '</' + parentTagName + '>';
        }
        setSelectionRange(outputDiv, tagStart, pCloseIdx + parentTagName.length + 3);
        replaceSelectionWithText(result);
    } else {
        replaceSelectionWithText('<' + targetTag + '>' + selectedText + '</' + targetTag + '>');
    }
    updateView();
}

function setLink() {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.toString().trim() === "") {
        alert("Выделите текст или объект для создания ссылки");
        return;
    }
    let selectedText = selection.toString().trim();
    saveState();
    let result = "";
    const imgRegex = /^<img[^>]+>$/i;
    const containerRegex = /^<(p|div|span)([^>]*?)>([\s\S]*?)<\/ \1>$/i;
    if (imgRegex.test(selectedText)) {
        result = '<a href="">' + selectedText + '</a>';
    } else if (containerRegex.test(selectedText)) {
        result = selectedText.replace(containerRegex, function(match, tagName, attrs, content) {
            return '<' + tagName + attrs + '><a href="">' + content + '</a></' + tagName + '>';
        });
    } else {
        result = '<a href="">' + selectedText + '</a>';
    }
    replaceSelectionWithText(result);
    updateView();
}

function removeLink() {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.toString().trim() === "") {
        alert("Выделите текст со ссылкой");
        return;
    }
    let selectedText = selection.toString();
    if (!/<\/a>/i.test(selectedText) && !/<a\b/i.test(selectedText)) {
        alert("В выделенном фрагменте не найдено тегов ссылки ");
        return;
    }
    saveState();
    const result = selectedText.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1');
    replaceSelectionWithText(result);
    updateView();
}

function makeList(type) {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.toString().trim() === "") {
        alert("Выделите текст или абзацы, которые хотите превратить в список");
        return;
    }

    const range = selection.getRangeAt(0);
    let selectedText = range.toString().trim();

    let items = selectedText.includes('</p>')
        ? selectedText.split(/<\/p>/i).map(function(item) { return item.replace(/<p[^>]*>/g, '').trim(); })
        : selectedText.split('\n').map(function(item) { return item.trim(); });

    items = items.filter(function(item) { return item !== ""; });

    var cleanedItems = items.map(function(item) {
        return item.replace(/^(?:\*|·|•|[-–—•·*]|\d+[.)])\s*/g, '').trim();
    });

    var listItems = cleanedItems.map(function(item) { return '  <li>' + item + '</li>'; }).join('\n');
    var newList = '<' + type + '>\n' + listItems + '\n</' + type + '>';

    insertTextAtCaret(newList);
}

function listToParagraphs() {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.toString().trim() === "") {
        alert("Выделите список целиком");
        return;
    }
    const range = selection.getRangeAt(0);
    let selectedText = range.toString().trim();
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let matches = [], match;
    while ((match = liRegex.exec(selectedText)) !== null) {
        matches.push('<p>' + match[1].trim() + '</p>');
    }
    if (matches.length > 0) {
        replaceSelectionWithText(matches.join('\n'));
    }
}

function convertToParagraph() {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.toString().trim() === "") {
        alert("Выделите текст заголовка или цитаты вместе с тегами");
        return;
    }

    let selectedText = selection.toString().trim();

    const targetTagsRegex = /<(h[1-6]|div|blockquote)[^>]*?>([\s\S]*?)<\/(h[1-6]|div|blockquote)>/i;

    if (targetTagsRegex.test(selectedText)) {
        saveState();
        const result = selectedText.replace(targetTagsRegex, '<p>$2</p>');
        insertTextAtCaret(result);
    } else {
        alert("Выделите заголовок (например: <h3>Ваш текст</h3>) или цитату, чтобы превратить её в абзац.");
    }
}

function wrapInParagraph() {
    const selection = window.getSelection();
    const selectedText = selection.toString();
    if (selectedText.trim() === "") {
        alert("Выделите текст, который хотите обернуть в абзац ");
        return;
    }
    saveState();
    const result = '<p>' + selectedText + '</p>';
    replaceSelectionWithText(result);
    if (typeof updateView === 'function') updateView();
}

document.getElementById('cleanEntitiesOnly').addEventListener('click', function() {
    saveState();
    let text = outputDiv.innerText;
    const inlineTags = ['span', 'strong', 'b', 'a'];
    let result = text.replace(/<\/([a-z1-6]+)>/gi, function(match, tagName) {
        if (inlineTags.includes(tagName.toLowerCase())) {
            return ' </' + tagName + '>';
        }
        return '</' + tagName + '>';
    });
    result = result.replace(/–|—/g, '\u2014');
    result = result.replace(/…/g, '...');
    result = result.replace(/&nbsp;/g, ' ');
    result = result.replace(/[ ]{2,}/g, ' ');
    outputDiv.innerText = result;
    updateView();
    saveState();
});

function makeBold() {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.toString().trim() === "") return;
    let selectedText = selection.toString().trim();
    saveState();
    const blockRegex = /^<(p|h[1-6]|div|li)[^>]*>([\s\S]*?)<\/ \1>$/i;
    let result;
    if (blockRegex.test(selectedText)) {
        result = selectedText.replace(blockRegex, function(match, tagName, content) {
            const openingTag = match.match(/^<[^>]+>/)[0];
            const closingTag = '</' + tagName + '>';
            return openingTag + '<strong>' + content + '</strong>' + closingTag;
        });
    } else {
        result = '<strong>' + selectedText + '</strong>';
    }
    replaceSelectionWithText(result);
    updateView();
}

function makeNotBold() {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.toString().trim() === "") return;
    const selectedText = selection.toString();
    saveState();
    const result = selectedText.replace(/<\/?(strong|b)\b[^>]*>/gi, '');
    replaceSelectionWithText(result);
    updateView();
}

function transformSelection(transformationType) {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.toString().trim() === "") return;
    const selectedText = selection.toString();
    const tagOrTextRegex = /(<[^>]+>)|([^<]+)/g;
    let isFirstLetterHandled = false;
    const newText = selectedText.replace(tagOrTextRegex, function(match, tag, text) {
        if (tag) return tag;
        if (text) {
            switch (transformationType) {
                case 'lowercase': return text.toLowerCase();
                case 'uppercase': return text.toUpperCase();
                case 'capitalize':
                    let lower = text.toLowerCase();
                    if (!isFirstLetterHandled) {
                        return lower.replace(/[a-zа-яё]/i, function(letter) {
                            isFirstLetterHandled = true;
                            return letter.toUpperCase();
                        });
                    }
                    return lower;
                default: return text;
            }
        }
        return match;
    });
    replaceSelectionWithText(newText);
    if (typeof updateView === 'function') updateView();
}

function convertToLower() {
    transformSelection('lowercase');
}

function convertToUpper() {
    transformSelection('uppercase');
}

function convertToSentenceCase() {
    transformSelection('capitalize');
}

function convertUrlsToLinks() {
    saveState();
    let text = outputDiv.innerText;
    const combinedRegex = /<a\b[^>]*>[\s\S]*?<\/a>|(<[^>]+>)|((https?:\/\/[^\s<]+[^.,\s<])|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}))/gi;
    let result = text.replace(combinedRegex, function(match, anyTag, content, url, email) {
        if (match.startsWith('<'))
            return match;
        if (url) {
            const secureUrl = url.trim().toLowerCase().startsWith('javascript:') ? '#' : url;
            return '<a href="' + secureUrl + '">' + url + '</a>';
        }
        if (email) return '<a href="mailto:' + email + '">' + email + '</a>';
        return match;
    });
    outputDiv.innerText = result;
    updateView();
    saveState();
}

function convertPhonesToLinks() {
    saveState();
    let text = outputDiv.innerText;

    const combinedRegex = /<a\b[^>]*>[\s\S]*?<\/a>|(<[^>]+>)|(?<!\d)((?:\+7|8)[\s\xA0\-\(]*\d{3}[\s\xA0\-\)]*\d{3}[\s\xA0\-]*\d{2}[\s\xA0\-]*\d{2})(?!\d)/gi;

    let result = text.replace(combinedRegex, function(match, tag, phone) {
        if (match.toLowerCase().startsWith('<a')) return match;
        if (tag) return tag;
        if (phone) {
            let cleanNumber = phone.replace(/[^\d]/g, '');
            if (cleanNumber.startsWith('8')) {
                cleanNumber = '+7' + cleanNumber.substring(1);
            }

            if (cleanNumber.length !== 11 && !cleanNumber.startsWith('+')) {
                return match;
            }
            return '<a href="tel:' + cleanNumber + '">' + phone + '</a>';
        }
        return match;
    });

    outputDiv.innerText = result;
    updateView();
    saveState();
}

document.getElementById('pasteToResult').addEventListener('click', function() {
    const sourceText = inputTextArea.value;
    outputDiv.innerText = sourceText;
    updateView();
    saveState();
});

outputDiv.addEventListener('click', function(e) {
    const selection = window.getSelection();
    if (selection.toString().length > 0) return;
    const pos = getCaretPosition(outputDiv);
    const text = outputDiv.innerText;
    let startPos = -1;
    for (let i = pos; i >= 0; i--) {
        if (text[i] === '<') {
            startPos = i;
            break;
        }
    }
    let endPos = -1;
    for (let i = pos; i < text.length; i++) {
        if (text[i] === '>') {
            endPos = i + 1;
            break;
        }
    }
    if (startPos !== -1 && endPos !== -1) {
        let tagContent = text.substring(startPos, endPos);
        let match = tagContent.match(/^<([a-z1-6]+)/i);
        if (match) {
            let tagName = match[1];
            let closingTag = '</' + tagName + '>';
            let closingIdx = text.indexOf(closingTag, startPos);
            if (closingIdx !== -1) {
                endPos = closingIdx + closingTag.length;
            }
        } else if (tagContent.startsWith('</')) {
            let tagNameMatch = tagContent.match(/^<\/([a-z1-6]+)/i);
            let tagName = tagNameMatch ? tagNameMatch[1] : '';

            let openingIdx = text.lastIndexOf('<' + tagName, startPos);
            if (openingIdx !== -1) {
                startPos = openingIdx;
            }
        }
        setSelectionRange(outputDiv, startPos, endPos);
    }
});

function setSelectionRange(element, start, end) {
    let charCount = 0;
    let range = document.createRange();
    let nodeStack = [element];
    let node;
    let startFound = false;
    while (node = nodeStack.pop()) {
        if (node.nodeType === 3) {
            let nextCharCount = charCount + node.length;
            if (!startFound && start >= charCount && start <= nextCharCount) {
                range.setStart(node, start - charCount);
                startFound = true;
            }
            if (startFound && end >= charCount && end <= nextCharCount) {
                range.setEnd(node, end - charCount);
                let sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                return;
            }
            charCount = nextCharCount;
        } else {
            let i = node.childNodes.length;
            while (i--) nodeStack.push(node.childNodes[i]);
        }
    }
}

function addLinkAttr(type) {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.toString().trim() === "") {
        alert("Выделите фрагмент кода, содержащий тег ");
        return;
    }
    let selectedText = selection.toString();
    const linkRegex = /<a\s+([^>]+)>/gi;
    if (!linkRegex.test(selectedText)) {
        alert("В выделенном фрагменте не найден тег ");
        return;
    }
    linkRegex.lastIndex = 0;
    let newText = selectedText.replace(linkRegex, function(match, attributes) {
        let updatedAttributes = attributes;
        if (type === 'target' || type === 'both') {
            if (updatedAttributes.includes('target=')) {
                updatedAttributes = updatedAttributes.replace(/target="[^"]*"/g, 'target="_blank"');
            } else {
                updatedAttributes += ' target="_blank"';
            }
        }
        if (type === 'rel' || type === 'both') {
            if (updatedAttributes.includes('rel=')) {
                updatedAttributes = updatedAttributes.replace(/rel="[^"]*"/g, 'rel="nofollow noindex"');
            } else {
                updatedAttributes += ' rel="nofollow noindex"';
            }
        }
        updatedAttributes = updatedAttributes.replace(/\s{2,}/g, ' ').trim();
        return '<a ' + updatedAttributes + '>';
    });

    replaceSelectionWithText(newText);
}

function getRelativePath(url) {
    if (!url.startsWith('http')) return url;
    try {
        const urlObj = new URL(url);
        return urlObj.pathname + urlObj.search + urlObj.hash;
    } catch (e) {
        return url;
    }
}

function makeTextLinksRelative() {
    saveState();
    let html = outputDiv.innerText;
    const result = html.replace(/(<a\s+[^>]*?href=["'])([^"']*?)(["'][^>]*>)/gi, function(match, start, url, end) {
        if (/^(mailto:|tel:|javascript:|#)/i.test(url)) return match;
        return start + getRelativePath(url) + end;
    });
    outputDiv.innerText = result;
    if (typeof updateView === 'function') updateView();
}

function makeImagesRelative() {
    saveState();
    let html = outputDiv.innerText;
    const result = html.replace(/(<img\s+[^>]*?src=["'])([^"']*?)(["'][^>]*>)/gi, function(match, start, url, end) {
        return start + getRelativePath(url) + end;
    });
    outputDiv.innerText = result;
    if (typeof updateView === 'function') updateView();
}

function makeEverythingRelative() {
    saveState();
    let html = outputDiv.innerText;
    const result = html.replace(/(<(?:a|img)\s+[^>]*?(?:href|src)=["'])([^"']*?)(["'][^>]*>)/gi, function(match, start, url, end) {
        if (/^(mailto:|tel:|javascript:|#)/i.test(url)) return match;
        return start + getRelativePath(url) + end;
    });
    outputDiv.innerText = result;
    if (typeof updateView === 'function') updateView();
}

document.getElementById('copyFinalBtn').addEventListener('click', function() {
    const text = outputDiv.innerText.replace(/\u200B/g, '').trim();
    navigator.clipboard.writeText(text).then(function() {
        const originalText = this.innerText;
        this.innerText = 'Скопировано!';
        setTimeout(function() {
            this.innerText = originalText;
        }.bind(this), 2000);
    }.bind(this));
});

outputDiv.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        saveState();
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const br = document.createTextNode('\n');
        range.insertNode(br);
        range.setStartAfter(br);
        range.setEndAfter(br);
        selection.removeAllRanges();
        selection.addRange(range);
        updateView();
    }
});

outputDiv.addEventListener('input', function(e) {
    updateView();
});

outputDiv.addEventListener('paste', function(e) {
    if (this.getAttribute('data-internal-insert') === 'true') return;

    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    insertTextAtCaret(text);
});

saveState();

document.getElementById('searchInput').addEventListener('input', function() {
    const query = this.value.toLowerCase();
    const text = outputDiv.innerText.toLowerCase();
    searchResults = [];
    if (query.length > 0) {
        let pos = text.indexOf(query);
        while (pos !== -1) {
            searchResults.push(pos);
            pos = text.indexOf(query, pos + query.length);
        }
    }
    currentSearchIdx = searchResults.length > 0 ? 0 : -1;
    updateView();
    updateSearchStatus();
    scrollToCurrentMatch();
});

function searchNext() {
    if (searchResults.length === 0) return;
    currentSearchIdx = (currentSearchIdx + 1) % searchResults.length;
    updateView();
    updateSearchStatus();
    scrollToCurrentMatch();
}

function searchPrev() {
    if (searchResults.length === 0) return;
    currentSearchIdx = (currentSearchIdx - 1 + searchResults.length) % searchResults.length;
    updateView();
    updateSearchStatus();
    scrollToCurrentMatch();
}

function updateSearchStatus() {
    const status = document.getElementById('searchStatus');
    if (searchResults.length === 0) {
        status.innerText = "0/0";
    } else {
        status.innerText = (currentSearchIdx + 1) + "/" + searchResults.length;
    }
}

function scrollToCurrentMatch() {
    setTimeout(function() {
        const currentEl = outputDiv.querySelector('.search-hl.current');
        if (currentEl) {
            currentEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
    }, 10);
}

