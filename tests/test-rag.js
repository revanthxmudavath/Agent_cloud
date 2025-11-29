const WebSocket = require('../node_modules/.pnpm/ws@7.5.10_bufferutil@4.0.9_utf-8-validate@5.0.10/node_modules/ws');

  const userId = 'rag-test-user-' + Date.now();
  const ws = new WebSocket(`ws://localhost:8787/ws?userId=${userId}`);

  let step = 0;
  const testSteps = [
    { type: 'chat', content: 'My favorite color is blue' },
    { type: 'chat', content: 'I work as a software engineer' },
    { type: 'chat', content: 'I enjoy hiking on weekends' },
    { delay: 3000 }, // Wait for embeddings
    { type: 'chat', content: 'What do you know about my hobbies?' },
    { type: 'chat', content: 'What is my profession?' },
    { type: 'chat', content: 'What is my favorite color?' }
  ];

  ws.on('open', () => {
    console.log('✅ WebSocket connected for RAG test');
    runNextStep();
  });

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());

    if (message.type === 'connected') {
      console.log(`✅ Connected as user: ${message.userId}`);
    } else if (message.type === 'chat_response') {
      console.log(`🤖 Response: ${message.content}\n`);

      // Check for RAG recall
      const content = message.content.toLowerCase();
      if (step >= 4) {
        if ((step === 4 && content.includes('hik')) ||
            (step === 5 && content.includes('engineer')) ||
            (step === 6 && content.includes('blue'))) {
          console.log('✅ PASS: RAG successfully recalled previous information');
        } else {
          console.log('⚠️  WARNING: RAG may not have recalled information');
        }
      }

      setTimeout(() => runNextStep(), 1000);
    }
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
    process.exit(1);
  });

  ws.on('close', () => {
    console.log('\n✅ RAG test complete');
    process.exit(0);
  });

  function runNextStep() {
    if (step >= testSteps.length) {
      ws.close();
      return;
    }

    const currentStep = testSteps[step];
    step++;

    if (currentStep.delay) {
      console.log(`⏳ Waiting ${currentStep.delay}ms for embeddings...`);
      setTimeout(() => runNextStep(), currentStep.delay);
    } else {
      console.log(`📤 Step ${step}: ${currentStep.content}`);
      ws.send(JSON.stringify(currentStep));
    }
  }