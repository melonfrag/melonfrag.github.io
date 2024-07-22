const chatOutput = document.getElementById('chat-output');
const chatInput = document.getElementById('chat-input');

let socket;
let reconnectInterval = 10000; // 重连间隔，单位：毫秒
let nickname = "Anonymous";
let ipAddress = "";
let history = [];
let historyIndex = -1;

function setupWebSocket() {
    socket = new WebSocket('ws://39.105.127.10:6602');

    socket.addEventListener('open', function() {
        console.log('Connected to WebSocket');
        // Request nickname and IP address once connected
        nickname = prompt("Enter your nickname") || nickname; // Default to "Anonymous" if user cancels
        socket.send(JSON.stringify({"name": nickname}));

        fetch('https://api.ipify.org?format=json')
            .then(response => response.json())
            .then(data => {
                ipAddress = data.ip;
            });
    });

    socket.addEventListener('message', function(event) {
        const data = event.data;
        displayMessage(data.slice(1, -1));
    });

    socket.addEventListener('close', function(event) {
        console.log('WebSocket closed. Reconnecting in 10 seconds...');
        setTimeout(setupWebSocket, reconnectInterval);
    });

    socket.addEventListener('error', function(event) {
        console.error('WebSocket error:', event);
        socket.close(); // Trigger the close event to attempt reconnect
    });
}


function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderMarkdown(text) {
    // Escape HTML tags
    text = escapeHtml(text);

    // Markdown rendering logic
    return text
        // Bold
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\_\_(.*?)\_\_/g, '<strong>$1</strong>')
        // Italics
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\_(.*?)\_/g, '<em>$1</em>')
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
        // Lists
        .replace(/^\s*[\*\-\+]\s+(.*)$/gm, '<li>$1</li>')
        .replace(/<\/li>\n<li>/g, '</li><li>')
        .replace(/^(\s*<li>.*<\/li>\s*)+$/gm, '<ul>$&</ul>')
        // Blockquotes
        .replace(/^>\s+(.*)$/gm, '<blockquote>$1</blockquote>')
        // Code blocks
        .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Tables
        .replace(/^\|(.+?)\|\s*$/gm, function (match, content) {
            const rows = content.split('|').map(row => row.trim()).filter(row => row.length > 0);
            const headers = rows[0].split(/[\|\s]+/).filter(cell => cell.length > 0);
            const data = rows.slice(1).map(row => row.split(/[\|\s]+/).filter(cell => cell.length > 0));
            return `<table><thead><tr><th>${headers.join('</th><th>')}</th></tr></thead><tbody>${data.map(row => `<tr><td>${row.join('</td><td>')}</td></tr>`).join('')}</tbody></table>`;
        })
        // Strikethrough
        .replace(/~~(.*?)~~/g, '<del>$1</del>')
        // Subscript
        .replace(/~(.*?)~/g, '<sub>$1</sub>')
        // Superscript
        .replace(/\^(.*?)\^/g, '<sup>$1</sup>')
        // Footnotes
        .replace(/\[\^(.*?)\]\((.*?)\)/g, '<sup>$1</sup> <small>$2</small>')
        // Line breaks
        .replace(/\n/g, '<br>')
        // Paragraphs
        .replace(/(?:^|\n)(?!\s*$)(.*?)(?:\n|$)/g, '<p>$1</p>')
}

function renderLatex(text) {
    const latexContainer = document.createElement('div');
    latexContainer.innerHTML = `\\(${text}\\)`;
    chatOutput.appendChild(latexContainer);

    // Use KaTeX to render LaTeX
    try {
        katex.render(text, latexContainer, {
            throwOnError: false
        });
        chatOutput.scrollTop = chatOutput.scrollHeight;
    } catch (err) {
        console.error('KaTeX error:', err);
    }
}

function displayMessage(message) {
    const messageElement = document.createElement('div');
    let messageContent = renderMarkdown(message)
                            .replace(/\\n/g, "<br>")
                            .replace(/\\"/g,'"')
                            .replace(/\\\\/g,'\\');

    // Process LaTeX and replace only the LaTeX part
    if (messageContent.includes('$')) {
        const latexMatches = messageContent.match(/\$(.*?)\$/g);
        if (latexMatches) {
            latexMatches.forEach(latex => {
                const latexText = latex.replace(/\$/g, '');
                const latexContainer = document.createElement('span');
                latexContainer.className = 'latex-container';
                try {
                    katex.render(latexText, latexContainer, {
                        throwOnError: false
                    });
                } catch (err) {
                    console.error('KaTeX error:', err);
                }

                // Replace LaTeX placeholder with rendered content
                messageContent = messageContent.replace(latex, latexContainer.outerHTML);
            });
        }
    }

    messageElement.innerHTML = messageContent;
    chatOutput.innerHTML += messageElement.outerHTML;
    chatOutput.scrollTop = chatOutput.scrollHeight;
}



chatInput.addEventListener('keydown', function(event) {
    if (event.key === 'ArrowUp') {
        if (historyIndex > 0) {
            historyIndex--;
            chatInput.value = history[historyIndex];
            chatInput.selectionStart = chatInput.selectionEnd = chatInput.value.length;
        }
        event.preventDefault();
    } else if (event.key === 'ArrowDown') {
        if (historyIndex < history.length - 1) {
            historyIndex++;
            chatInput.value = history[historyIndex];
            chatInput.selectionStart = chatInput.selectionEnd = chatInput.value.length;
        } else {
            historyIndex = history.length;
            chatInput.value = '';
            chatInput.selectionStart = chatInput.selectionEnd = chatInput.value.length;
        }
        event.preventDefault();
    } else if (event.key === 'Enter' && event.ctrlKey) {
        event.preventDefault();
        const cursorPos = chatInput.selectionStart;
        const text = chatInput.value;
        chatInput.value = text.slice(0, cursorPos) + '\n' + text.slice(cursorPos);
        chatInput.selectionStart = chatInput.selectionEnd = cursorPos + 1;
    } else if (event.key === 'Enter' && !event.ctrlKey) {
        event.preventDefault();
        const message = chatInput.value.trim();
        if (message) {
            const formattedMessage = {
                sender: nickname,
                tripcode: ipAddress,
                msg: message
            };
            socket.send(JSON.stringify(formattedMessage));
            chatInput.value = '';
            history.push(message);
            historyIndex = history.length;
        }
    }
});

// Initialize WebSocket connection
setupWebSocket();
