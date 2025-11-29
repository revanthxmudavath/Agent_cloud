const WebSocket = require('../node_modules/.pnpm/ws@7.5.10_bufferutil@4.0.9_utf-8-validate@5.0.10/node_modules/ws');

  const userId = 'llm-test-user-' + Date.now();
  const ws = new WebSocket(`ws://localhost:8787/ws?userId=${userId}`);

  let messageCount = 0;
  const testMessages = [
    'Hello, how are you?',
    'What can you help me with?',
    'Can you create tasks for me?',
    'What was my first question?'
  ];

  ws.on('open', () => {
    console.log('✅ WebSocket connected');
    sendNextMessage();
  });

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log(`\n📨 Received: ${message.type}`);

    if (message.type === 'connected') {
      console.log(`✅ Connected as user: ${message.userId}`);
    } else if (message.type === 'chat_response') {
      console.log(`🤖 Response: ${message.content}`);

      // Verify no echo
      if (message.content.startsWith('Echo:')) {
        console.log('❌ FAIL: Still using echo placeholder!');
        process.exit(1);
      } else {
        console.log('✅ PASS: LLM response received (no echo)');
      }

      // Send next message after delay
      setTimeout(() => {
        sendNextMessage();
      }, 2000);
    }
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
    process.exit(1);
  });

  ws.on('close', () => {
    console.log('\n✅ WebSocket closed');
    console.log(`\n🎉 All ${messageCount} LLM tests passed!`);
    process.exit(0);
  });

  function sendNextMessage() {
    if (messageCount >= testMessages.length) {
      ws.close();
      return;
    }

    const message = testMessages[messageCount];
    messageCount++;

    console.log(`\n📤 Test ${messageCount}: Sending "${message}"`);
    ws.send(JSON.stringify({
      type: 'chat',
      content: message
    }));
  }