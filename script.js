const chatOutput = document.getElementById('chat-output');
const chatInput = document.getElementById('chat-input');

let socket;
let reconnectInterval = 5000; // 重连间隔，单位：毫秒
let nickname = "";
let history = [];
let historyIndex = -1;
let unreadCount = 0;

function setupWebSocket() {
    socket = new WebSocket('ws://localhost:12345');

    socket.addEventListener('open', function() {
        displayMessage('Connected to server.');
        let userInput = prompt("Enter your nickname:");
        if (userInput) {
            // Find the first occurrence of '#'
            let separatorIndex = userInput.indexOf('#');
            // Extract name and password
            nickname = userInput.substring(0, separatorIndex).trim();
            password = userInput.substring(separatorIndex + 1).trim();
            if (separatorIndex === -1) {
                nickname = userInput
                password = "";
            }
            console.log(`${nickname},${password}`)
            if (nickname === "") {
                displayMessage("You didn't enter a nickname. You are disconnected.");
                socket.close(); // Close the socket if user cancels
                return; // Exit the function
            } else {
                // Send name and password to server
                displayMessage(`Connecting...`)
                console.log(`{"name": ${nickname}, "password": ${password}}`)
                socket.send(JSON.stringify({"name": nickname, "password": password}));
            }
        } else {
            displayMessage("You didn't enter any information. You are disconnected.");
            socket.close(); // Close the socket if user cancels
            return; // Exit the function
        }
    });

    socket.addEventListener('message', function(event) {
        const data = event.data;
        displayMessage(data.slice(1, -1));
    });

    socket.addEventListener('close', function(event) {
        displayMessage('Connection closed. Reconnecting in 5 seconds...');
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
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderMarkdown(text) {
    
    // Escape HTML tags
    text = escapeHtml(text);

    // Markdown rendering logic
    text = text
        // Headers
        .replace(/^######\s*(.*)$/gm, '<h6>$1</h6>')
        .replace(/^#####\s*(.*)$/gm, '<h5>$1</h5>')
        .replace(/^####\s*(.*)$/gm, '<h4>$1</h4>')
        .replace(/^###\s*(.*)$/gm, '<h3>$1</h3>')
        .replace(/^##\s*(.*)$/gm, '<h2>$1</h2>')
        .replace(/^#\s*(.*)$/gm, '<h1>$1</h1>')
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
        .replace(/<ul>(.*?)<\/ul>/g, function (match, content) {
            return '<ul style="padding-left: 1em;">' + content + '</ul>';
        })
        .replace(/<li>(.*?)<\/li>/g, function (match, content) {
            return '<li style="margin-left: 1em;">' + content + '</li>';
        })
        // Blockquotes
        .replace(/^>\s+(.*)$/gm, '<blockquote style="border-left: 2px solid #ddd; padding-left: 1em;">$1</blockquote>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Tables
        .replace(/^\|(.+?)\|\s*$/gm, function (match, content) {
            const rows = content.split('|').map(row => row.trim()).filter(row => row.length > 0);
            const headers = rows[0].split(/[\|\s]+/).filter(cell => cell.length > 0);
            const data = rows.slice(1).map(row => row.split(/[\|\s]+/).filter(cell => cell.length > 0));
            return `<table style="border-collapse: collapse; width: 100%;"><thead><tr><th>${headers.join('</th><th>')}</th></tr></thead><tbody>${data.map(row => `<tr><td>${row.join('</td><td>')}</td></tr>`).join('')}</tbody></table>`;
        })
        // Strikethrough
        .replace(/~~(.*?)~~/g, '<del>$1</del>')
        // Subscript
        .replace(/~(.*?)~/g, '<sub>$1</sub>')
        // Superscript
        .replace(/\^(.*?)\^/g, '<sup>$1</sup>')
        // Footnotes
        .replace(/\[\^(.*?)\]\((.*?)\)/g, '<sup>$1</sup> <small>$2</small>')
        // Highlight
        .replace(/==(.*?)==/g, '<mark>$1</mark>')
        // Line breaks
        .replace(/\n/g, '<br>');
        return text;
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

function renderMarkdownCode(text){
    return text
        // Code blocks
        .replace(/CODE_BEGIN::([\s\S]*?)::CODE_END/g, '<pre><code>$1</code></pre>')
}

function displayMessage(message) {
    if(message){
        const messageElement = document.createElement('div');
        var index = message.indexOf(": ");
        if(message.includes("CODE_BEGIN::") && message.includes("::CODE_END")){
            messageContent = message.substring(0, index+2) + renderMarkdownCode(message.substring(index+2, message.length).replace(/\\n/g,"\n"))
                            .replace(/\\"/g, '"')
                            .replace(/\\\\/g, '\\')
        }else{
            messageContent = message.substring(0, index+2) + renderMarkdown(message.substring(index+2, message.length)
            .replace(/\\n/g, "\n")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\'))
            
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
        }


        messageElement.innerHTML = messageContent;
        chatOutput.innerHTML += messageElement.outerHTML;
        chatOutput.scrollTop = chatOutput.scrollHeight;
        if (!document.hasFocus()) {
            unreadCount++;
            document.title = `(${unreadCount}) WebSocket Chat`;
        }
    }
}

chatInput.addEventListener('keydown', function(event) {
    const cursorPosition = chatInput.selectionStart;
    const textBeforeCursor = chatInput.value.substring(0, cursorPosition);
    const cursorLine = textBeforeCursor.split('\n').length;
    
    if (event.key === 'ArrowUp' && cursorLine === 1 && historyIndex > 0) {
        historyIndex--;
        chatInput.value = history[historyIndex];
    } else if (event.key === 'ArrowDown' && cursorLine === chatInput.value.split('\n').length) {
        if (historyIndex < history.length - 1) {
            historyIndex++;
            chatInput.value = history[historyIndex];
        } else {
            chatInput.value = '';
            historyIndex = history.length;
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
                msg: message
            };
            socket.send(JSON.stringify(formattedMessage));
            chatInput.value = '';
            history.push(message);
            historyIndex = history.length;
        }
    }
});


window.addEventListener('focus', () => {
    unreadCount = 0;
    document.title = 'WebSocket Chat';
});

window.addEventListener('blur', () => {
    if (unreadCount > 0) {
        document.title = `(${unreadCount}) WebSocket Chat`;
    }
});

// Initialize WebSocket connection
setupWebSocket();
