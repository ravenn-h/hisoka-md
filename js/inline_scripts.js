
        document.addEventListener('DOMContentLoaded', function() {
            // Tab navigation
            const navLinks = document.querySelectorAll('.nav-link');
            const homePage = document.getElementById('homePage');
            const adminPanel = document.getElementById('adminPanel');
            const statsPage = document.getElementById('statsPage');

            navLinks.forEach(link => {
                link.addEventListener('click', function(e) {
                    e.preventDefault();
                    const tab = this.getAttribute('data-tab');

                    // Hide all content and show selected
                    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                    this.classList.add('active');

                    if (tab === 'home') {
                        homePage.style.display = 'grid';
                        adminPanel.style.display = 'none';
                        statsPage.style.display = 'none';
                    } else if (tab === 'admin') {
                        homePage.style.display = 'none';
                        adminPanel.style.display = 'block';
                        statsPage.style.display = 'none';
                    } else if (tab === 'stats') {
                        homePage.style.display = 'none';
                        adminPanel.style.display = 'none';
                        statsPage.style.display = 'block';
                        loadDetailedStats();
                    }
                });
            });

            // Tab buttons within admin panel
            const tabButtons = document.querySelectorAll('.tab-btn');
            const tabContents = document.querySelectorAll('.tab-content');

            tabButtons.forEach(button => {
                button.addEventListener('click', function() {
                    const tab = this.getAttribute('data-tab');

                    tabButtons.forEach(b => b.classList.remove('active'));
                    this.classList.add('active');

                    tabContents.forEach(content => {
                        if (content.getAttribute('data-tab') === tab) {
                            content.classList.add('active');
                        } else {
                            content.classList.remove('active');
                        }
                    });
                });
            });

            // Pairing code form submission
            const pairingForm = document.getElementById('pairing-form');
            const resultContainer = document.getElementById('result-container');
            const resultTitle = document.getElementById('result-title');
            const resultMessage = document.getElementById('result-message');
            const pairingCodeContainer = document.getElementById('pairing-code-container');
            const pairingCodeElement = document.getElementById('pairing-code');
            const copyBtn = document.getElementById('copy-btn');

            pairingForm.addEventListener('submit', async function(e) {
                e.preventDefault();

                const countryCode = document.getElementById('countryCode').value;
                const phoneNumber = document.getElementById('phoneNumber').value;
                const premiumKey = document.getElementById('premiumKey').value;

                // Reset result container
                resultContainer.className = 'result-container';
                pairingCodeContainer.style.display = 'none';

                try {
                    const response = await fetch('/request-pairing', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            phoneNumber: countryCode + phoneNumber,
                            premiumKey: premiumKey || undefined
                        })
                    });

                    const data = await response.json();

                    if (data.success) {
                        resultContainer.classList.add('result-success');
                        resultTitle.textContent = 'Pairing Code Generated Successfully!';
                        resultMessage.textContent = `Your WhatsApp pairing code has been generated successfully from Server ${data.serverUsed}.`;

                        if (data.pairingCode) {
                            pairingCodeElement.textContent = data.formattedCode || data.pairingCode;
                            pairingCodeContainer.style.display = 'block';

                            // Enable copy button if it's an 8-digit code
                            if (data.canCopy) {
                                copyBtn.style.display = 'block';
                                copyBtn.onclick = function() {
                                    navigator.clipboard.writeText(data.rawCode || data.pairingCode)
                                        .then(() => {
                                            alert('Pairing code copied to clipboard!');
                                        })
                                        .catch(err => {
                                            console.error('Failed to copy: ', err);
                                        });
                                };
                            } else {
                                copyBtn.style.display = 'none';
                            }
                        }
                    } else {
                        resultContainer.classList.add('result-error');
                        resultTitle.textContent = 'Error Generating Pairing Code';
                        resultMessage.textContent = data.error || 'An unknown error occurred.';
                    }
                } catch (error) {
                    resultContainer.classList.add('result-error');
                    resultTitle.textContent = 'Request Failed';
                    resultMessage.textContent = 'Failed to connect to the server. Please try again later.';
                    console.error('Error:', error);
                }
            });

            // Admin login form
            const adminLoginForm = document.getElementById('admin-login-form');
            const adminDashboard = document.getElementById('admin-dashboard');

            adminLoginForm.addEventListener('submit', async function(e) {
                e.preventDefault();

                const username = document.getElementById('username').value;
                const password = document.getElementById('password').value;

                // Basic authentication header
                const authHeader = 'Basic ' + btoa(username + ':' + password);

                try {
                    // Test authentication by trying to get keys
                    const response = await fetch('/admin/keys', {
                        headers: {
                            'Authorization': authHeader
                        }
                    });

                    if (response.ok) {
                        // Hide login form, show dashboard
                        adminLoginForm.style.display = 'none';
                        adminDashboard.style.display = 'block';

                        // Store auth header for future requests
                        window.adminAuthHeader = authHeader;

                        // Load admin data
                        loadKeys();
                        loadUsers();
                    } else {
                        alert('Authentication failed. Please check your credentials.');
                    }
                } catch (error) {
                    alert('Error connecting to server. Please try again.');
                    console.error('Error:', error);
                }
            });

            // Load server status and stats
            loadServerStatus();
            loadStats();

            // Refresh stats every 30 seconds
            setInterval(loadStats, 30000);
            setInterval(loadServerStatus, 30000);
        });

        // Function to load server status
        async function loadServerStatus() {
            try {
                const response = await fetch('/server-status');
                const data = await response.json();

                if (data.success) {
                    let html = '';

                    // Regular servers
                    html += '<h3>Regular Servers</h3>';
                    html += '<div class="server-list">';
                    data.serverStatus.regular.forEach(server => {
                        html += `
                            <div class="server-item">
                                <div>
                                    <span class="server-status status-${server.status}"></span>
                                    Server ${server.serverIndex}
                                </div>
                                <div class="server-sessions">${server.sessions}/${server.maxSessions}</div>
                            </div>
                        `;
                    });
                    html += '</div>';

                    // Premium servers
                    html += '<h3 style="margin-top: 20px;">Premium Servers</h3>';
                    html += '<div class="server-list">';
                    data.serverStatus.premium.forEach(server => {
                        html += `
                            <div class="server-item">
                                <div>
                                    <span class="server-status status-${server.status}"></span>
                                    Server ${server.serverIndex}
                                </div>
                                <div class="server-sessions">${server.sessions}/${server.maxSessions}</div>
                            </div>
                        `;
                    });
                    html += '</div>';

                    document.getElementById('server-status').innerHTML = html;
                }
            } catch (error) {
                console.error('Error loading server status:', error);
                document.getElementById('server-status').innerHTML = '<p>Failed to load server status. Please try again later.</p>';
            }
        }

        // Function to load statistics
        async function loadStats() {
            try {
                const response = await fetch('/bot-counts');
                const data = await response.json();

                if (data.success) {
                    document.getElementById('total-bots').textContent = data.botCounts.total;
                    document.getElementById('regular-bots').textContent = data.botCounts.regular;
                    document.getElementById('premium-bots').textContent = data.botCounts.premium;

                    const onlineServers = data.serverStatus.regularServersOnline + data.serverStatus.premiumServersOnline;
                    const totalServers = data.serverStatus.regularServersOnline + data.serverStatus.premiumServersOnline;
                    document.getElementById('online-servers').textContent = `${onlineServers}/${totalServers}`;
                }
            } catch (error) {
                console.error('Error loading stats:', error);
            }
        }

        // Function to load detailed statistics for stats page
        async function loadDetailedStats() {
            try {
                const response = await fetch('/bot-counts');
                const data = await response.json();

                if (data.success) {
                    document.getElementById('stats-total-bots').textContent = data.botCounts.total;
                    document.getElementById('stats-premium-bots').textContent = data.botCounts.premium;

                    const onlineServers = data.serverStatus.regularServersOnline + data.serverStatus.premiumServersOnline;
                    const totalServers = data.serverStatus.regularServersOnline + data.serverStatus.premiumServersOnline;
                    document.getElementById('stats-online-servers').textContent = `${onlineServers}/${totalServers}`;

                    // Load server status details
                    const serverResponse = await fetch('/server-status');
                    const serverData = await serverResponse.json();

                    if (serverData.success) {
                        let html = '';

                        // Regular servers
                        html += '<h4>Regular Servers</h4>';
                        html += '<div class="server-list">';
                        serverData.serverStatus.regular.forEach(server => {
                            html += `
                                <div class="server-item">
                                    <div>
                                        <span class="server-status status-${server.status}"></span>
                                        Server ${server.serverIndex}
                                    </div>
                                    <div class="server-sessions">${server.sessions}/${server.maxSessions} sessions</div>
                                </div>
                            `;
                        });
                        html += '</div>';

                        // Premium servers
                        html += '<h4 style="margin-top: 20px;">Premium Servers</h4>';
                        html += '<div class="server-list">';
                        serverData.serverStatus.premium.forEach(server => {
                            html += `
                                <div class="server-item">
                                    <div>
                                        <span class="server-status status-${server.status}"></span>
                                        Server ${server.serverIndex}
                                    </div>
                                    <div class="server-sessions">${server.sessions}/${server.maxSessions} sessions</div>
                                </div>
                            `;
                        });
                        html += '</div>';

                        document.getElementById('stats-server-status').innerHTML = html;
                    }

                    // Load uptime
                    try {
                        const healthResponse = await fetch('/health');
                        const healthData = await healthResponse.json();
                        
                        if (healthData.performance && healthData.performance.uptime) {
                            const uptime = healthData.performance.uptime;
                            const hours = Math.floor(uptime / 3600);
                            const minutes = Math.floor((uptime % 3600) / 60);
                            document.getElementById('stats-uptime').textContent = `${hours}h ${minutes}m`;
                        }
                    } catch (error) {
                        console.error('Error loading uptime:', error);
                    }
                }
            } catch (error) {
                console.error('Error loading detailed stats:', error);
                document.getElementById('stats-server-status').innerHTML = '<p>Failed to load server status details. Please try again later.</p>';
            }
        }

        // Admin functions
        async function loadKeys() {
            try {
                const response = await fetch('/admin/keys', {
                    headers: {
                        'Authorization': window.adminAuthHeader
                    }
                });

                if (response.ok) {
                    const data = await response.json();

                    if (data.success) {
                        const keyList = document.getElementById('key-list');

                        if (data.keys.length > 0) {
                            keyList.innerHTML = '';
                            data.keys.forEach(key => {
                                const li = document.createElement('li');
                                li.className = 'key-item';
                                li.textContent = key;
                                keyList.appendChild(li);
                            });
                        } else {
                            keyList.innerHTML = '<li>No premium keys generated yet</li>';
                        }
                    }
                }
            } catch (error) {
                console.error('Error loading keys:', error);
            }
        }

        // Add generate key functionality
        document.getElementById('generate-key-btn').addEventListener('click', async function() {
            try {
                const response = await fetch('/admin/generate-key', {
                    method: 'POST',
                    headers: {
                        'Authorization': window.adminAuthHeader
                    }
                });

                if (response.ok) {
                    const data = await response.json();

                    if (data.success) {
                        document.getElementById('key-result').innerHTML = `
                            <div class="result-success">
                                <p>New premium key generated: <strong>${data.key}</strong></p>
                            </div>
                        `;

                        // Reload the key list
                        loadKeys();
                    }
                }
            } catch (error) {
                console.error('Error generating key:', error);
            }
        });

        // User management functions
        async function loadUsers() {
            try {
                const response = await fetch('/admin/users', {
                    headers: {
                        'Authorization': window.adminAuthHeader
                    }
                });

                if (response.ok) {
                    const data = await response.json();

                    if (data.success) {
                        const userList = document.getElementById('user-list-body');

                        if (data.users.length > 0) {
                            userList.innerHTML = '';
                            data.users.forEach(user => {
                                const tr = document.createElement('tr');

                                tr.innerHTML = `
                                    <td>${user.username}</td>
                                    <td>${user.isAdmin ? 'Administrator' : 'User'}</td>
                                    <td>
                                        ${user.username !== 'rogue' ? 
                                            `<button class="action-btn btn-delete" data-username="${user.username}">Delete</button>` : 
                                            '<em>Cannot delete</em>'
                                        }
                                    </td>
                                `;

                                userList.appendChild(tr);
                            });

                            // Add event listeners to delete buttons
                            document.querySelectorAll('.btn-delete').forEach(btn => {
                                btn.addEventListener('click', function() {
                                    const username = this.getAttribute('data-username');
                                    deleteUser(username);
                                });
                            });
                        } else {
                            userList.innerHTML = '<tr><td colspan="3">No users found</td></tr>';
                        }
                    }
                }
            } catch (error) {
                console.error('Error loading users:', error);
            }
        }

        // Add user functionality
        document.getElementById('add-user-form').addEventListener('submit', async function(e) {
            e.preventDefault();

            const username = document.getElementById('new-username').value;
            const password = document.getElementById('new-password').value;
            const isAdmin = document.getElementById('is-admin').checked;

            try {
                const response = await fetch('/admin/add-user', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': window.adminAuthHeader
                    },
                    body: JSON.stringify({
                        username,
                        password,
                        isAdmin
                    })
                });

                if (response.ok) {
                    const data = await response.json();

                    if (data.success) {
                        alert(`User ${username} created successfully!`);
                        document.getElementById('add-user-form').reset();
                        loadUsers();
                    } else {
                        alert(data.error || 'Failed to create user');
                    }
                } else {
                    const data = await response.json();
                    alert(data.error || 'Failed to create user');
                }
            } catch (error) {
                console.error('Error adding user:', error);
                alert('Error creating user');
            }
        });

        // Delete user functionality
        async function deleteUser(username) {
            if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
                return;
            }

            try {
                const response = await fetch(`/admin/users/${username}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': window.adminAuthHeader
                    }
                });

                if (response.ok) {
                    const data = await response.json();

                    if (data.success) {
                        alert(`User ${username} deleted successfully!`);
                        loadUsers();
                    } else {
                        alert(data.error || 'Failed to delete user');
                    }
                } else {
                    const data = await response.json();
                    alert(data.error || 'Failed to delete user');
                }
            } catch (error) {
                console.error('Error deleting user:', error);
                alert('Error deleting user');
            }
        }
    