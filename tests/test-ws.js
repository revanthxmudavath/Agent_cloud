// Use ws directly from pnpm store (Windows symlink workaround)
const WebSocket = require('../node_modules/.pnpm/ws@7.5.10_bufferutil@4.0.9_utf-8-validate@5.0.10/node_modules/ws');

// Configuration
const WS_URL = 'ws://localhost:8787';
const userId = 'test-user-' + Date.now(); // Unique user for this test

console.log('🧪 Starting WebSocket Tests');
console.log('📋 User ID:', userId);
console.log('🔗 Connecting to:', `${WS_URL}/ws?userId=${userId}`);
console.log('─'.repeat(60));

const ws = new WebSocket(`${WS_URL}/ws?userId=${userId}`);

let testStep = 0;
let taskId = null;

// Test sequence with delays
const runTests = () => {
  setTimeout(() => {
    console.log('\n📝 TEST 4: Chat Message');
    ws.send(JSON.stringify({
      type: 'chat',
      content: 'Hello, assistant! This is a test message.'
    }));
  }, 1000);

  setTimeout(() => {
    console.log('\n📝 TEST 5.1: Create Task');
    ws.send(JSON.stringify({
      type: 'create_task',
      title: 'Test Task from WebSocket',
      description: 'Testing task creation via WebSocket',
      priority: 'high',
      dueDate: Math.floor(Date.now() / 1000) + 86400 // Tomorrow
    }));
  }, 3000);

  setTimeout(() => {
    console.log('\n📝 TEST 5.2: List Tasks');
    ws.send(JSON.stringify({
      type: 'list_tasks'
    }));
  }, 5000);

  setTimeout(() => {
    if (taskId) {
      console.log('\n📝 TEST 5.3: Update Task');
      ws.send(JSON.stringify({
        type: 'update_task',
        taskId: taskId,
        title: 'Updated Test Task',
        priority: 'medium'
      }));
    }
  }, 7000);

  setTimeout(() => {
    if (taskId) {
      console.log('\n📝 TEST 5.4: Complete Task');
      ws.send(JSON.stringify({
        type: 'complete_task',
        taskId: taskId
      }));
    }
  }, 9000);

  setTimeout(() => {
    if (taskId) {
      console.log('\n📝 TEST 5.5: Delete Task');
      ws.send(JSON.stringify({
        type: 'delete_task',
        taskId: taskId
      }));
    }
  }, 11000);

  setTimeout(() => {
    console.log('\n📝 TEST 4.2: Another Chat Message');
    ws.send(JSON.stringify({
      type: 'chat',
      content: 'Can you help me with a task?'
    }));
  }, 13000);

  setTimeout(() => {
    console.log('\n✅ All tests completed!');
    console.log('─'.repeat(60));
    ws.close();
    process.exit(0);
  }, 15000);
};

// Event handlers
ws.on('open', () => {
  console.log('✅ WebSocket Connected Successfully');
  console.log('─'.repeat(60));
  runTests();
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());

  console.log('\n📨 Message Received:');
  console.log('   Type:', message.type);

  if (message.type === 'connected') {
    console.log('   ✅ Connection confirmed');
    console.log('   User ID:', message.userId);
  } else if (message.type === 'chat_response') {
    console.log('   💬 Response:', message.content);
  } else if (message.type === 'task_created') {
    console.log('   ✅ Task created successfully');
    console.log('   Task ID:', message.task.id);
    console.log('   Title:', message.task.title);
    taskId = message.task.id; // Store for later tests
  } else if (message.type === 'tasks_list') {
    console.log('   ✅ Tasks retrieved');
    console.log('   Count:', message.count);
    console.log('   Tasks:', JSON.stringify(message.tasks, null, 2));
  } else if (message.type === 'task_updated') {
    console.log('   ✅ Task updated');
    console.log('   Updated Title:', message.task.title);
  } else if (message.type === 'task_completed') {
    console.log('   ✅ Task completed');
    console.log('   Completed:', message.task.completed);
  } else if (message.type === 'task_deleted') {
    console.log('   ✅ Task deleted');
    console.log('   Deleted Task ID:', message.taskId);
  } else if (message.type === 'error') {
    console.log('   ❌ Error:', message.error);
    console.log('   Details:', message.details);
  } else {
    console.log('   📦 Full message:', JSON.stringify(message, null, 2));
  }
});

ws.on('error', (error) => {
  console.error('\n❌ WebSocket Error:', error.message);
  console.error('   Make sure wrangler dev is running on port 8787');
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log('\n🔌 WebSocket Connection Closed');
  console.log('   Code:', code);
  console.log('   Reason:', reason.toString() || 'No reason provided');
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Test interrupted by user');
  ws.close();
  process.exit(0);
});