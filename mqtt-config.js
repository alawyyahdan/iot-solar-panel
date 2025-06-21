// MQTT Configuration
const MQTT_CONFIG = {
    broker: 'mqtt.adan.lat',
    port: 9001, // WebSocket port (biasanya 8083 untuk MQTT over WebSocket)
    clientId: '' + Math.random().toString(16).substr(2, 8),
    username: 'webtugas',
    password: 'webtugas',
    
    // Topics from Arduino
    topics: {
        servo: 'solar/servo',
        measuredpv: 'solar/convertedpv',
        ldr_right: 'solar/ldr_right',
        ldr_left: 'solar/ldr_left',
        raindrops_analog: 'solar/raindrops_analog',
        raindrops_digital: 'solar/raindrops_digital',
        jemuran: 'solar/jemuran',
        servo_jemuran: 'solar/servo_jemuran'
    }
};

// Global variables untuk menyimpan data sensor
let sensorData = {
    servo: 90,
    measuredPV: 0,
    ldrRight: false,
    ldrLeft: false,
    raindropsAnalog: 0,
    raindropsDigital: false,
    jemuran: false,
    servoJemuran: 90
};

// Global variable untuk tracking status cuaca saat ini
let currentWeatherStatus = 'clear';
let lastWeatherStatus = 'clear';

// MQTT Client
let mqttClient = null;

// Connection timeout handler
let connectionTimeout = null;

// Fungsi untuk connect ke MQTT broker
function connectMQTT() {
    console.log('🔄 Starting MQTT connection...');
    updateConnectionStatus('disconnected', 'Connecting to MQTT broker...');
    
    // Clear any existing timeout
    if (connectionTimeout) {
        clearTimeout(connectionTimeout);
    }
    
    // Cek apakah MQTT.js library tersedia
    if (typeof mqtt === 'undefined') {
        console.error('❌ MQTT.js library not available');
        updateConnectionStatus('error', 'MQTT library not available');
        return;
    }
    
    // Disconnect existing client if any
    if (mqttClient && mqttClient.connected) {
        console.log('🔌 Disconnecting existing client...');
        mqttClient.end(true);
    }
    
    try {
        const clientUrl = `ws://${MQTT_CONFIG.broker}:${MQTT_CONFIG.port}`;
        console.log('🌐 Connecting to:', clientUrl);
        console.log('👤 Username:', MQTT_CONFIG.username);
        console.log('🆔 Client ID:', MQTT_CONFIG.clientId);
        
        // Set connection timeout (15 seconds)
        connectionTimeout = setTimeout(() => {
            console.error('⏰ Connection timeout after 15 seconds');
            if (mqttClient) {
                mqttClient.end(true);
            }
            updateConnectionStatus('error', 'Connection timeout - check broker availability');
        }, 15000);
        
        mqttClient = mqtt.connect(clientUrl, {
            clientId: MQTT_CONFIG.clientId,
            username: MQTT_CONFIG.username,
            password: MQTT_CONFIG.password,
            keepalive: 30,
            clean: true,
            reconnectPeriod: 0, // Disable auto reconnect to avoid loops
            connectTimeout: 10000, // 10 seconds
            protocolVersion: 4
        });
        
        mqttClient.on('connect', function(connack) {
            console.log('✅ Successfully connected to MQTT broker');
            console.log('📋 Connection details:', connack);
            
            // Clear timeout
            if (connectionTimeout) {
                clearTimeout(connectionTimeout);
                connectionTimeout = null;
            }
            
            updateConnectionStatus('connected', 'Connected to MQTT broker');
            
            // Subscribe to all topics
            const topics = Object.values(MQTT_CONFIG.topics);
            console.log('📡 Subscribing to', topics.length, 'topics...');
            
            topics.forEach((topic, index) => {
                mqttClient.subscribe(topic, function(err) {
                    if (!err) {
                        console.log(`✅ Subscribed to topic ${index + 1}/${topics.length}: ${topic}`);
                    } else {
                        console.error(`❌ Failed to subscribe to ${topic}:`, err);
                    }
                });
            });
        });
        
        mqttClient.on('message', function(topic, message) {
            const payload = message.toString();
            console.log(`📨 Message on ${topic}: ${payload}`);
            
            // Update sensor data berdasarkan topic
            updateSensorData(topic, payload);
            
            // Update visual elements di website
            updateVisualElements(topic, payload);
        });
        
        mqttClient.on('error', function(error) {
            console.error('❌ MQTT connection error:', error);
            
            // Clear timeout
            if (connectionTimeout) {
                clearTimeout(connectionTimeout);
                connectionTimeout = null;
            }
            
            updateConnectionStatus('error', 'Connection error: ' + error.message);
        });
        
        mqttClient.on('close', function() {
            console.log('🔌 MQTT connection closed');
            updateConnectionStatus('disconnected', 'Connection closed');
        });
        
        mqttClient.on('offline', function() {
            console.log('📴 MQTT client offline');
            updateConnectionStatus('disconnected', 'Client offline');
        });
        
        mqttClient.on('reconnect', function() {
            console.log('🔄 MQTT client attempting reconnect...');
            updateConnectionStatus('disconnected', 'Reconnecting...');
        });
        
    } catch (error) {
        console.error('💥 Error initializing MQTT client:', error);
        
        // Clear timeout
        if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
        }
        
        updateConnectionStatus('error', 'Failed to initialize: ' + error.message);
    }
}

// Fungsi untuk update sensor data
function updateSensorData(topic, payload) {
    const value = payload.trim();
    
    // Mark topic as received
    markTopicReceived(topic);
    
    switch (topic) {
        case MQTT_CONFIG.topics.servo:
            sensorData.servo = parseInt(value);
            break;
        case MQTT_CONFIG.topics.measuredpv:
            sensorData.measuredPV = parseFloat(value);
            break;
        case MQTT_CONFIG.topics.ldr_right:
            sensorData.ldrRight = value === '1';
            break;
        case MQTT_CONFIG.topics.ldr_left:
            sensorData.ldrLeft = value === '1';
            break;
        case MQTT_CONFIG.topics.raindrops_analog:
            sensorData.raindropsAnalog = parseInt(value);
            break;
        case MQTT_CONFIG.topics.raindrops_digital:
            sensorData.raindropsDigital = value === '1';
            break;
        case MQTT_CONFIG.topics.jemuran:
            sensorData.jemuran = value === '1';
            break;
        case MQTT_CONFIG.topics.servo_jemuran:
            sensorData.servoJemuran = parseInt(value);
            break;
        default:
            console.log(`Unknown topic: ${topic}`);
    }
}

// Fungsi untuk update elemen visual berdasarkan data sensor
function updateVisualElements(topic, payload) {
    // Update posisi matahari berdasarkan servo position (HANYA servo panel surya)
    if (topic === MQTT_CONFIG.topics.servo) {
        updateSunPosition(parseInt(payload));
    }
    
    // Update brightness berdasarkan LDR sensors
    if (topic === MQTT_CONFIG.topics.ldr_right || topic === MQTT_CONFIG.topics.ldr_left) {
        updateSceneBrightness();
        // Update posisi bulan juga saat LDR berubah (tanpa menggerakkan matahari)
        updateMoonVisibility();
    }
    
    // Update weather effects berdasarkan rain sensor (hanya analog yang trigger klasifikasi)
    if (topic === MQTT_CONFIG.topics.raindrops_analog) {
        checkWeatherChange();
    }
    
    // Update dashboard untuk semua perubahan
    updateDashboard();
}

// Fungsi untuk update posisi matahari
function updateSunPosition(servoAngle) {
    // Konversi servo angle (0-180) ke posisi matahari dari timur ke barat
    // 0° = timur (kiri), 90° = zenith (tengah atas), 180° = barat (kanan)
    
    // Hitung posisi X (horizontal): dari timur (200px) ke barat (1100px)
    const minX = 200;  // Posisi timur
    const maxX = 1100; // Posisi barat
    const xPosition = minX + (servoAngle / 180) * (maxX - minX);
    
    // Hitung posisi Y (vertikal): membuat lintasan parabola seperti matahari asli
    // Pada 0° dan 180° matahari rendah, pada 90° matahari tinggi
    const minY = 350;  // Posisi rendah (horizon)
    const maxY = 150;  // Posisi tinggi (zenith)
    
    // Rumus parabola: y = minY - (maxY - minY) * sin²(angle)
    const angleRad = (servoAngle * Math.PI) / 180;
    const yPosition = minY - (minY - maxY) * Math.pow(Math.sin(angleRad), 2);
    
    // Update posisi matahari dengan animasi smooth
    if (typeof TweenMax !== 'undefined') {
        TweenMax.to("#sun", 2, {
            x: xPosition - 980,  // Offset dari posisi default
            y: yPosition - 209,  // Offset dari posisi default
            ease: Power2.easeOut
        });
        
        // Cek status LDR untuk menentukan siang/malam
        const bothBright = sensorData.ldrRight && sensorData.ldrLeft;
        const bothDark = !sensorData.ldrRight && !sensorData.ldrLeft;
        
        // Debug log untuk servo position
        console.log(`Servo ${servoAngle}° - LDR Right: ${sensorData.ldrRight}, LDR Left: ${sensorData.ldrLeft}, Both Dark: ${bothDark}`);
        
        // Update opacity matahari berdasarkan status LDR dan posisi
        let sunOpacity;
        if (bothDark) {
            // Kedua LDR gelap = malam hari, matahari sangat redup
            sunOpacity = 0.1;
        } else if (bothBright) {
            // Kedua LDR terang = siang hari, matahari berdasarkan posisi normal
            sunOpacity = Math.max(0.4, Math.sin(angleRad));
        } else {
            // Salah satu LDR gelap = transisi sore/pagi
            sunOpacity = Math.max(0.2, Math.sin(angleRad) * 0.7);
        }
        TweenMax.to("#sun", 2, {opacity: sunOpacity});
        
        // Update warna langit berdasarkan posisi matahari
        updateSkyColor(servoAngle);
        
        // Update bulan berdasarkan LDR (tidak terkait servo)
        updateMoonVisibility();
    }
}

// Fungsi untuk update visibility bulan berdasarkan LDR (tidak terkait servo)
function updateMoonVisibility() {
    if (typeof TweenMax !== 'undefined') {
        // Pastikan data LDR sudah ada (tidak undefined)
        if (sensorData.ldrRight === undefined || sensorData.ldrLeft === undefined) {
            console.log('Moon Update - LDR data not ready yet, keeping moon hidden');
            TweenMax.to("#moon", 2, {opacity: 0});
            return;
        }
        
        // Cek status LDR untuk menentukan siang/malam
        const bothBright = sensorData.ldrRight && sensorData.ldrLeft;
        const bothDark = !sensorData.ldrRight && !sensorData.ldrLeft;
        
        // Debug log
        console.log('Moon Update - LDR Right:', sensorData.ldrRight, 'LDR Left:', sensorData.ldrLeft, 'Both Dark:', bothDark);
        
        // Tampilkan bulan HANYA ketika KEDUA LDR gelap (malam hari)
        // Jika salah satu LDR masih terang = masih siang, bulan TIDAK muncul
        // TIDAK ADA HUBUNGAN dengan servo jemuran!
        const moonOpacity = bothDark ? 1 : 0;
        console.log('Setting moon opacity to:', moonOpacity);
        TweenMax.to("#moon", 2, {opacity: moonOpacity});
    }
}

// Fungsi untuk update warna langit berdasarkan posisi matahari
function updateSkyColor(servoAngle) {
    if (typeof TweenMax !== 'undefined') {
        let skyColor;
        
        if (servoAngle <= 20) {
            // Fajar/Subuh - biru gelap dengan sentuhan pink
            skyColor = "hsl(240, 40%, 25%)";
        } else if (servoAngle <= 40) {
            // Terbit matahari - orange keemasan
            skyColor = "hsl(30, 85%, 55%)";
        } else if (servoAngle <= 70) {
            // Pagi menuju siang - biru langit pagi
            skyColor = "hsl(200, 70%, 65%)";
        } else if (servoAngle <= 110) {
            // Siang hari - biru langit cerah
            skyColor = "hsl(210, 80%, 70%)";
        } else if (servoAngle <= 140) {
            // Sore awal - biru dengan sentuhan kuning
            skyColor = "hsl(45, 60%, 60%)";
        } else if (servoAngle <= 160) {
            // Sore hari - orange kemerahan (golden hour)
            skyColor = "hsl(20, 90%, 50%)";
        } else if (servoAngle <= 175) {
            // Maghrib - merah jingga
            skyColor = "hsl(10, 80%, 45%)";
        } else {
            // Malam hari - biru gelap malam
            skyColor = "hsl(230, 50%, 20%)";
        }
        
        TweenMax.to(".st0", 3, {fill: skyColor});
    }
}

// Fungsi untuk update brightness scene (sekarang hanya mengatur warna langit)
function updateSceneBrightness() {
    const bothBright = sensorData.ldrRight && sensorData.ldrLeft;
    const bothDark = !sensorData.ldrRight && !sensorData.ldrLeft;
    
    if (typeof TweenMax !== 'undefined') {
        if (bothDark) {
            // Malam hari - langit gelap
            TweenMax.to(".st0", 2, {fill: "hsl(220, 50%, 20%)"});
        } else {
            // Siang hari - gunakan warna natural berdasarkan posisi servo
            if (sensorData.servo !== undefined) {
                updateSkyColor(sensorData.servo);
            } else {
                // Default ke warna siang jika servo belum ada data
                TweenMax.to(".st0", 2, {fill: "hsl(210, 80%, 70%)"});
            }
        }
        // Note: Opacity matahari dan bulan sekarang diatur di updateSunPosition()
    }
}

// Fungsi untuk mendapatkan status cuaca berdasarkan nilai analog
function getWeatherStatus(analogValue) {
    if (analogValue > 4094) {
        return { status: 'clear', intensity: 0, text: 'CERAH' };
    } else if (analogValue >= 3000) {
        return { status: 'drizzle', intensity: 1, text: 'GERIMIS' };
    } else if (analogValue >= 2000) {
        return { status: 'heavy', intensity: 2, text: 'HUJAN LEBAT' };
    } else {
        return { status: 'storm', intensity: 3, text: 'HUJAN DERAS' };
    }
}

// Fungsi untuk mengecek perubahan cuaca dan trigger animasi jika perlu
function checkWeatherChange() {
    const weather = getWeatherStatus(sensorData.raindropsAnalog);
    currentWeatherStatus = weather.status;
    
    // Hanya update animasi jika status cuaca berubah
    if (currentWeatherStatus !== lastWeatherStatus) {
        // Update animasi hujan berdasarkan status baru
        updateWeatherEffects(weather);
        
        // Update status terakhir
        lastWeatherStatus = currentWeatherStatus;
    }
}

// Fungsi untuk update weather effects dengan animasi (hanya dipanggil saat ada perubahan)
function updateWeatherEffects(weather) {
    // Hapus animasi hujan yang ada
    removeRainAnimation();
    
    // Tambahkan animasi sesuai intensitas
    if (weather.intensity > 0) {
        createRainAnimation(weather.intensity, weather.status);
    }
    
    // Update warna scene berdasarkan cuaca
    updateSceneWeather(weather);
}

// Fungsi untuk membuat animasi hujan SVG
function createRainAnimation(intensity, status) {
    // Hapus animasi hujan yang ada terlebih dahulu
    removeRainAnimation();
    
    // Dapatkan SVG element
    const svg = document.querySelector('svg');
    if (!svg) {
        console.error('SVG element not found');
        return;
    }
    
    // Konfigurasi hujan berdasarkan intensitas
    const rainConfig = {
        1: { // Gerimis
            dropCount: 80,
            speed: 3,
            color: 'rgba(135, 206, 235, 0.6)',
            strokeWidth: 1,
            length: 15
        },
        2: { // Hujan Lebat
            dropCount: 150,
            speed: 2,
            color: 'rgba(70, 130, 180, 0.7)',
            strokeWidth: 1.5,
            length: 20
        },
        3: { // Hujan Deras
            dropCount: 250,
            speed: 1.5,
            color: 'rgba(30, 144, 255, 0.8)',
            strokeWidth: 2,
            length: 25
        }
    };
    
    const config = rainConfig[intensity];
    
    // Buat grup untuk hujan di dalam SVG
    const rainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    rainGroup.id = 'rain-group';
    
    // Buat tetes hujan sebagai lines dalam SVG
    for (let i = 0; i < config.dropCount; i++) {
        const drop = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        
        // Posisi random dalam viewBox SVG (0-1270 untuk x, mulai dari atas untuk y)
        const x = Math.random() * 1270;
        const startY = -config.length - Math.random() * 200; // Mulai dari atas viewBox
        const endY = startY + config.length;
        
        drop.setAttribute('x1', x);
        drop.setAttribute('y1', startY);
        drop.setAttribute('x2', x + 5); // Sedikit miring untuk efek angin
        drop.setAttribute('y2', endY);
        drop.setAttribute('stroke', config.color);
        drop.setAttribute('stroke-width', config.strokeWidth);
        drop.setAttribute('opacity', 0.7 + Math.random() * 0.3);
        
        // Animasi CSS untuk tetes hujan
        const animationDelay = Math.random() * config.speed;
        drop.style.animation = `rain-fall-svg ${config.speed}s linear infinite`;
        drop.style.animationDelay = `${animationDelay}s`;
        
        rainGroup.appendChild(drop);
    }
    
    // Tambahkan grup hujan ke SVG (sebelum elemen terakhir agar tidak menutupi)
    svg.insertBefore(rainGroup, svg.lastElementChild);
    
    // Tambahkan CSS animation untuk SVG
    addSVGRainCSS();
    
    // Tambahkan efek petir untuk hujan deras
    if (intensity === 3) {
        createSVGLightning();
    }
}

// Fungsi untuk menambahkan CSS animasi hujan SVG
function addSVGRainCSS() {
    if (!document.getElementById('svg-rain-style')) {
        const style = document.createElement('style');
        style.id = 'svg-rain-style';
        style.textContent = `
            @keyframes rain-fall-svg {
                0% {
                    transform: translateY(0px);
                    opacity: 0;
                }
                10% {
                    opacity: 1;
                }
                90% {
                    opacity: 1;
                }
                100% {
                    transform: translateY(800px);
                    opacity: 0;
                }
            }
            
            #rain-group line {
                transform-origin: center;
            }
            
            @keyframes lightning-flash {
                0%, 95%, 100% { opacity: 0; }
                2%, 8% { opacity: 0.8; }
                15%, 20% { opacity: 0.6; }
            }
            
            .lightning-svg {
                animation: lightning-flash 1s ease-in-out;
                pointer-events: none;
            }
        `;
        document.head.appendChild(style);
    }
}

// Variable untuk mengatur interval petir
let lightningInterval = null;

// Fungsi untuk membuat efek petir SVG dengan delay 15 detik
function createSVGLightning() {
    // Pastikan CSS sudah dimuat
    addSVGRainCSS();
    
    // Hapus interval petir yang ada
    if (lightningInterval) {
        clearInterval(lightningInterval);
        lightningInterval = null;
    }
    
    // Dapatkan SVG element
    const svg = document.querySelector('svg');
    if (!svg) {
        return;
    }
    
    // Fungsi untuk membuat satu flash petir
    function createLightningFlash() {
        // Hapus petir yang ada
        let lightning = document.getElementById('lightning-svg');
        if (lightning) {
            lightning.remove();
        }
        
        // Buat rectangle untuk efek petir di dalam SVG dengan koordinat absolut
        lightning = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        lightning.id = 'lightning-svg';
        lightning.className = 'lightning-svg';
        lightning.setAttribute('x', '30');
        lightning.setAttribute('y', '26');
        lightning.setAttribute('width', '1217');
        lightning.setAttribute('height', '699');
        lightning.setAttribute('fill', 'rgba(255, 255, 255, 0.7)');
        lightning.setAttribute('opacity', '0');
        lightning.style.mixBlendMode = 'screen';
        
        // Tambahkan ke SVG sebagai layer atas (setelah background tapi sebelum elemen lain)
        const skyElement = document.getElementById('sky_1_');
        if (skyElement && skyElement.parentNode) {
            skyElement.parentNode.insertBefore(lightning, skyElement.nextSibling);
        } else {
            svg.appendChild(lightning);
        }
        
        // Trigger animasi flash sekali
        setTimeout(() => {
            if (lightning && lightning.parentNode) {
                lightning.style.animation = 'lightning-flash 1s ease-in-out';
                
                // Hapus element setelah animasi selesai
                setTimeout(() => {
                    if (lightning && lightning.parentNode) {
                        lightning.remove();
                    }
                }, 1000);
            }
        }, 50);
    }
    
    // Flash pertama langsung
    createLightningFlash();
    
    // Set interval untuk flash berikutnya setiap 15 detik
    lightningInterval = setInterval(createLightningFlash, 15000);
}

// Fungsi untuk menghapus animasi hujan
function removeRainAnimation() {
    // Hapus grup hujan SVG
    const rainGroup = document.getElementById('rain-group');
    if (rainGroup) {
        rainGroup.remove();
    }
    
    // Hapus efek petir SVG
    const lightning = document.getElementById('lightning-svg');
    if (lightning) {
        lightning.remove();
    }
    
    // Hentikan interval petir
    if (lightningInterval) {
        clearInterval(lightningInterval);
        lightningInterval = null;
    }
    
    // Bersihkan container HTML lama jika ada (untuk backward compatibility)
    const rainContainer = document.getElementById('rain-container');
    if (rainContainer) {
        rainContainer.remove();
    }
    
    const oldLightning = document.getElementById('lightning-effect');
    if (oldLightning) {
        oldLightning.remove();
    }
}

// Fungsi untuk update scene berdasarkan cuaca (mengoverride warna langit sementara)
function updateSceneWeather(weather) {
    if (typeof TweenMax !== 'undefined') {
        let weatherColor;
        let sunOpacity;
        
        switch (weather.status) {
            case 'clear':
                // Cuaca cerah - kembalikan ke warna berdasarkan posisi matahari
                updateSkyColor(sensorData.servo);
                return; // Exit early, biarkan warna natural
            case 'drizzle':
                // Gerimis - sedikit abu-abu
                weatherColor = "hsl(220, 30%, 35%)";
                sunOpacity = 0.7;
                break;
            case 'heavy':
                // Hujan lebat - lebih gelap
                weatherColor = "hsl(210, 40%, 25%)";
                sunOpacity = 0.4;
                break;
            case 'storm':
                // Hujan deras - sangat gelap
                weatherColor = "hsl(200, 50%, 15%)";
                sunOpacity = 0.2;
                break;
        }
        
        // Apply weather override
        TweenMax.to(".st0", 2, {fill: weatherColor});
        TweenMax.to("#sun", 2, {opacity: sunOpacity});
    }
}

// PV Chart data
let pvChartData = [];
let pvChart = null;

// Initialize PV Chart
function initPVChart() {
    const canvas = document.getElementById('pv-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Simple line chart implementation
    pvChart = {
        canvas: canvas,
        ctx: ctx,
        data: [],
        maxDataPoints: 20,
        
        addData: function(value) {
            this.data.push(value);
            if (this.data.length > this.maxDataPoints) {
                this.data.shift();
            }
            this.draw();
        },
        
        draw: function() {
            const ctx = this.ctx;
            const canvas = this.canvas;
            const data = this.data;
            
            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            if (data.length < 2) return;
            
            // Find min/max for scaling
            const min = Math.min(...data);
            const max = Math.max(...data);
            const range = max - min || 1;
            
            // Draw grid
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 4; i++) {
                const y = (canvas.height / 4) * i;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(canvas.width, y);
                ctx.stroke();
            }
            
            // Draw line
            ctx.strokeStyle = '#4CAF50';
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            for (let i = 0; i < data.length; i++) {
                const x = (canvas.width / (this.maxDataPoints - 1)) * i;
                const y = canvas.height - ((data[i] - min) / range) * canvas.height;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            
            ctx.stroke();
            
            // Draw points
            ctx.fillStyle = '#4CAF50';
            for (let i = 0; i < data.length; i++) {
                const x = (canvas.width / (this.maxDataPoints - 1)) * i;
                const y = canvas.height - ((data[i] - min) / range) * canvas.height;
                
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
    };
}

// Fungsi untuk update dashboard
function updateDashboard() {
    // Update servo position
    const servoValue = document.getElementById('servo-value');
    if (servoValue) {
        servoValue.textContent = `${sensorData.servo}°`;
    }
    
    // Update PV voltage with chart
    const pvValue = document.getElementById('pv-value');
    if (pvValue) {
        pvValue.textContent = `${sensorData.measuredPV.toFixed(2)}V`;
        
        // Add to chart
        if (pvChart) {
            pvChart.addData(sensorData.measuredPV);
        }
    }
    
    // Update weather status (simplified)
    const weatherElement = document.getElementById('weather-value');
    if (weatherElement) {
        const weather = getWeatherStatus(sensorData.raindropsAnalog);
        let weatherText = '';
        
        switch (weather.status) {
            case 'clear':
                weatherText = 'Terang';
                break;
            case 'drizzle':
                weatherText = 'Gerimis';
                break;
            case 'heavy':
                weatherText = 'Hujan Lebat';
                break;
            case 'storm':
                weatherText = 'Hujan Deras';
                break;
        }
        
        weatherElement.textContent = weatherText;
    }
    
    // Update clothesline status (simplified)
    const clotheslineElement = document.getElementById('clothesline-status');
    if (clotheslineElement) {
        // Determine status based on jemuran digital and servo position
        let status = '';
        
        if (sensorData.jemuran) {
            // If jemuran is true, clothes are safe/lifted
            status = 'Sudah Diangkat';
        } else {
            // If jemuran is false, clothes are being dried
            status = 'Sedang Dijemur';
        }
        
        clotheslineElement.textContent = status;
    }
}

// Fungsi untuk update status koneksi
function updateConnectionStatus(status, message) {
    // Update connection indicator di dashboard baru
    const connectionDot = document.getElementById('connection-dot');
    const connectionText = document.getElementById('connection-text');
    
    if (connectionDot && connectionText) {
        connectionDot.className = `connection-dot ${status}`;
        connectionText.textContent = message;
    }
    
    // Update popup status
    updatePopupStatus(status, message);
    
    // Backward compatibility dengan status panel lama (jika masih ada)
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
        statusElement.className = `connection-status ${status}`;
        statusElement.innerHTML = `
            <span class="status-indicator"></span>
            <span class="status-text">${message}</span>
        `;
    }
}

// Fungsi untuk disconnect MQTT
function disconnectMQTT() {
    if (mqttClient && mqttClient.connected) {
        mqttClient.end();
        console.log('Disconnected from MQTT broker');
        updateConnectionStatus('disconnected', 'Disconnected from MQTT broker');
    }
}

// Auto-start connection when script loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('MQTT Config loaded, waiting for MQTT.js library...');
    
    // Show popup immediately
    showPopup();
    
    // Add event listeners for popup
    const startButton = document.getElementById('start-dashboard');
    const retryButton = document.getElementById('retry-connection');
    const errorToggle = document.getElementById('error-toggle');
    
    if (startButton) {
        startButton.addEventListener('click', hidePopup);
    }
    
    if (retryButton) {
        retryButton.addEventListener('click', retryConnection);
    }
    
    if (errorToggle) {
        errorToggle.addEventListener('click', function() {
            const content = document.getElementById('error-content');
            const icon = this.querySelector('.accordion-icon');
            
            if (content && icon) {
                const isOpen = content.classList.contains('open');
                if (isOpen) {
                    content.classList.remove('open');
                    this.classList.remove('active');
                } else {
                    content.classList.add('open');
                    this.classList.add('active');
                }
            }
        });
    }
    
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds
    
    // Initialize PV Chart
    initPVChart();
    
    // Wait for MQTT.js library to load
    function waitForMQTTLibrary() {
        attempts++;
        
        if (typeof mqtt !== 'undefined') {
            console.log('✅ MQTT.js library loaded successfully');
            console.log('🔗 MQTT version:', mqtt.VERSION || 'Unknown');
            
            // Set initial sky color to dawn/default
            if (typeof TweenMax !== 'undefined') {
                console.log('✅ GSAP library also available');
                updateSkyColor(0); // Default to dawn color
            } else {
                console.log('⚠️ GSAP library not available');
            }
            
            // Start connection
            setTimeout(() => {
                connectMQTT();
            }, 1000);
            
            // Add demo data after 3 seconds for testing (will be overridden by real MQTT data)
            setTimeout(() => {
                if (!mqttClient || !mqttClient.connected) {
                    console.log('🎭 Adding demo data for testing dashboard...');
                    // Simulate some sensor data for testing
                    sensorData.servo = 90;
                    sensorData.measuredPV = 3.2;
                    sensorData.ldrRight = true;
                    sensorData.ldrLeft = false;
                    sensorData.raindropsAnalog = 4000;
                    sensorData.raindropsDigital = false;
                    sensorData.jemuran = false;
                    sensorData.servoJemuran = 45;
                    
                    // Update dashboard with demo data
                    updateDashboard();
                    updateSunPosition(90);
                    updateMoonVisibility();
                    
                    // Simulate some PV voltage changes for chart
                    let pvValue = 3.2;
                    setInterval(() => {
                        if (!mqttClient || !mqttClient.connected) {
                            pvValue += (Math.random() - 0.5) * 0.5;
                            pvValue = Math.max(0, Math.min(5, pvValue));
                            sensorData.measuredPV = pvValue;
                            updateDashboard();
                        }
                    }, 2000);
                }
            }, 3000);
            
        } else if (attempts < maxAttempts) {
            console.log(`⏳ Waiting for MQTT.js library... (${attempts}/${maxAttempts})`);
            // Check what's available in global scope
            if (attempts === 5) {
                console.log('🔍 Available globals:', Object.keys(window).filter(k => k.toLowerCase().includes('mqtt')));
            }
            setTimeout(waitForMQTTLibrary, 100);
        } else {
            console.error('❌ MQTT.js library failed to load after 5 seconds');
            console.log('🔍 Final check - available globals:', Object.keys(window).filter(k => k.toLowerCase().includes('mqtt')));
            updateConnectionStatus('error', 'MQTT library failed to load - check internet connection');
        }
    }
    
    waitForMQTTLibrary();
});

// MQTT Popup Functions
let currentPopupStep = 'connecting';
let popupErrorLog = [];
let topicDataReceived = {};
let topicTimeouts = {};
let dataCheckInterval = null;

function showPopupStep(stepId) {
    console.log(`Transitioning to step: ${stepId}`);
    
    // Don't transition if we're already on this step
    if (currentPopupStep === stepId) {
        return;
    }
    
    // Hide all steps first with fade out
    const steps = document.querySelectorAll('.step-container');
    steps.forEach(step => {
        step.classList.add('hidden');
        step.classList.remove('fade-in');
    });
    
    // Show target step with fade in animation
    setTimeout(() => {
        const targetStep = document.getElementById(stepId);
        if (targetStep) {
            // Make sure all other steps are completely hidden
            steps.forEach(step => {
                if (step.id !== stepId) {
                    step.style.display = 'none';
                }
            });
            
            // Show and animate the target step
            targetStep.style.display = 'block';
            setTimeout(() => {
                targetStep.classList.remove('hidden');
                targetStep.classList.add('fade-in');
                currentPopupStep = stepId;
                console.log(`Now showing step: ${stepId}`);
            }, 50);
        }
    }, 200); // Wait for fade out to complete
}

function updatePopupStatus(status, message) {
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-message');
    
    if (statusDot && statusText) {
        statusDot.className = `status-dot ${status}`;
        statusText.textContent = message;
    }
    
    // Handle different connection states
    switch (status) {
        case 'connected':
            // Only proceed to subscribing if we're currently connecting
            if (currentPopupStep === 'step-connecting') {
                setTimeout(() => {
                    showPopupStep('step-subscribing');
                    // Start monitoring for data after subscribing step is shown
                    startDataMonitoring();
                    // Wait for data after showing subscribing step
                    setTimeout(() => {
                        checkAllTopicsReceived();
                    }, 3000); // Wait 3 seconds for data
                }, 500); // Small delay for smooth transition
            }
            break;
        case 'error':
            showPopupError(message);
            break;
        case 'disconnected':
            if (currentPopupStep !== 'step-error') {
                showPopupStep('step-connecting');
            }
            break;
    }
}

function showPopupError(errorMessage) {
    showPopupStep('step-error');
    
    // Update error message
    const errorElement = document.getElementById('error-description');
    if (errorElement) {
        errorElement.textContent = errorMessage;
    }
    
    // Add to error log
    const timestamp = new Date().toLocaleTimeString();
    popupErrorLog.push(`[${timestamp}] ${errorMessage}`);
    
    // Update error log display
    const errorLogElement = document.getElementById('error-log-display');
    if (errorLogElement) {
        errorLogElement.textContent = popupErrorLog.join('\n');
    }
    
    // Update missing topics
    updateMissingTopics();
}

function hidePopup() {
    const popup = document.getElementById('mqtt-popup');
    if (popup) {
        popup.classList.add('hidden');
        setTimeout(() => {
            popup.style.display = 'none';
        }, 300);
    }
    
    // Activate dashboard
    const dashboard = document.querySelector('.dashboard-container');
    if (dashboard) {
        dashboard.classList.add('active');
    }
}

function showPopup() {
    const popup = document.getElementById('mqtt-popup');
    if (popup) {
        popup.style.display = 'flex';
        popup.classList.remove('hidden');
        
        // Reset all steps and show only connecting
        currentPopupStep = '';
        const steps = document.querySelectorAll('.step-container');
        steps.forEach(step => {
            step.classList.add('hidden');
            step.classList.remove('fade-in');
            step.style.display = 'none';
        });
        
        // Show connecting step immediately
        setTimeout(() => {
            showPopupStep('step-connecting');
        }, 100);
    }
}

function startDataMonitoring() {
    // Initialize topic tracking
    topicDataReceived = {};
    Object.values(MQTT_CONFIG.topics).forEach(topic => {
        topicDataReceived[topic] = false;
    });
    
    console.log('Started monitoring topics:', Object.keys(topicDataReceived));
}

function markTopicReceived(topic) {
    if (topicDataReceived.hasOwnProperty(topic)) {
        topicDataReceived[topic] = true;
        console.log(`Data received for topic: ${topic}`);
    }
}

function checkAllTopicsReceived() {
    const missingTopics = [];
    const receivedTopics = [];
    
    Object.entries(topicDataReceived).forEach(([topic, received]) => {
        if (received) {
            receivedTopics.push(topic);
        } else {
            missingTopics.push(topic);
        }
    });
    
    console.log('Topics status check:');
    console.log('Received:', receivedTopics);
    console.log('Missing:', missingTopics);
    
    if (missingTopics.length === 0) {
        // All topics received data
        showPopupStep('step-success');
    } else {
        // Some topics missing data
        const errorMsg = `Missing data from ${missingTopics.length} topic(s)`;
        showPopupError(errorMsg);
    }
}

function updateMissingTopics() {
    const missingTopicsContainer = document.getElementById('missing-topics-list');
    if (!missingTopicsContainer) return;
    
    const missingTopics = [];
    Object.entries(topicDataReceived).forEach(([topic, received]) => {
        if (!received) {
            missingTopics.push(topic);
        }
    });
    
    if (missingTopics.length > 0) {
        missingTopicsContainer.innerHTML = missingTopics
            .map(topic => `<div class="missing-topic">${topic}</div>`)
            .join('');
    } else {
        missingTopicsContainer.innerHTML = '<div style="color: #10b981; font-size: 14px;">All topics receiving data</div>';
    }
}

function retryConnection() {
    console.log('🔄 Retrying MQTT connection...');
    
    // Clear any existing timeout
    if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
    }
    
    popupErrorLog = []; // Clear error log
    topicDataReceived = {}; // Reset topic tracking
    showPopupStep('step-connecting');
    
    // Reset status
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-message');
    if (statusDot && statusText) {
        statusDot.className = 'status-dot connecting';
        statusText.textContent = 'Retrying connection...';
    }
    
    // Disconnect existing connection if any
    if (mqttClient) {
        try {
            console.log('🔌 Ending existing connection...');
            mqttClient.end(true);
            mqttClient = null;
        } catch (e) {
            console.log('⚠️ Error closing existing connection:', e);
        }
    }
    
    // Retry connection after short delay
    setTimeout(() => {
        connectMQTT();
    }, 2000);
}

// Popup functions are initialized in the main DOMContentLoaded event above

// Handle page unload
window.addEventListener('beforeunload', function() {
    disconnectMQTT();
}); 