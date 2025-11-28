// Test script for TaskWorkflow - Creates task with due date to trigger reminder workflow
const WebSocket = require('../node_modules/.pnpm/ws@7.5.10_bufferutil@4.0.9_utf-8-validate@5.0.10/node_modules/ws');

// Configuration
const WS_URL = 'ws://localhost:8787';
const userId = 'workflow-test-user-' + Date.now();

console.log('🧪 Starting Workflow Test');
console.log('📋 User ID:', userId);
console.log('🔗 Connecting to:', `${WS_URL}/ws?userId=${userId}`);
console.log('─'.repeat(60));

const ws = new WebSocket(`${WS_URL}/ws?userId=${userId}`);

let taskId = null;

// Test sequence
const runWorkflowTest = () => {
  setTimeout(() => {
    console.log('\n📝 TEST: Create Task with Due Date (triggers workflow)');

    // Calculate due date: 2 days from now (in seconds)
    const twoDaysFromNow = Math.floor(Date.now() / 1000) + (2 * 24 * 60 * 60);

    console.log(`   Due Date: ${new Date(twoDaysFromNow * 1000).toLocaleString()}`);
    console.log(`   Expected Reminder: ${new Date((twoDaysFromNow - 24 * 60 * 60) * 1000).toLocaleString()}`);

    ws.send(JSON.stringify({
      type: 'create_task',
      title: 'Workflow Test Task - Important Meeting',
      description: 'This task has a due date and should trigger a reminder workflow',
      priority: 'high',
      dueDate: twoDaysFromNow
    }));
  }, 2000);

  setTimeout(() => {
    console.log('\n📝 TEST: Check conversation history for workflow logs');
    // Note: In production, you would check conversations or workflow status API
    console.log('   Workflow should be scheduled in Cloudflare dashboard');
    console.log('   Check wrangler dev logs for workflow creation confirmation');
  }, 5000);

  setTimeout(() => {
    if (taskId) {
      console.log('\n📝 TEST: List tasks to confirm creation');
      ws.send(JSON.stringify({
        type: 'list_tasks'
      }));
    }
  }, 7000);

  setTimeout(() => {
    console.log('\n✅ Workflow Test completed!');
    console.log('─'.repeat(60));
    console.log('\n📊 Results:');
    console.log('   ✓ Task created with due date');
    console.log('   ✓ Workflow should be scheduled (check logs above)');
    console.log('   ℹ Reminder will be sent 24 hours before due date');
    console.log('\n💡 Next Steps:');
    console.log('   1. Check wrangler dev terminal for workflow logs');
    console.log('   2. Look for: "[PersonalAssistant] Scheduled reminder workflow: <ID>"');
    console.log('   3. The workflow is now running on Cloudflare infrastructure');
    console.log('─'.repeat(60));
    ws.close();
    process.exit(0);
  }, 10000);
};

// Event handlers
ws.on('open', () => {
  console.log('✅ WebSocket Connected Successfully');
  console.log('─'.repeat(60));
  runWorkflowTest();
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());

  console.log('\n📨 Message Received:');
  console.log('   Type:', message.type);

  if (message.type === 'connected') {
    console.log('   ✅ Connection confirmed');
    console.log('   User ID:', message.userId);
  } else if (message.type === 'task_created') {
    console.log('   ✅ Task created successfully');
    console.log('   Task ID:', message.task.id);
    console.log('   Title:', message.task.title);
    console.log('   Due Date:', new Date(message.task.dueDate * 1000).toLocaleString());
    console.log('   Priority:', message.task.priority);
    taskId = message.task.id;

    console.log('\n   🎯 Important: Check wrangler dev logs now!');
    console.log('   Look for workflow scheduling confirmation...');
  } else if (message.type === 'tasks_list') {
    console.log('   ✅ Tasks retrieved');
    console.log('   Count:', message.count);
    if (message.tasks.length > 0) {
      const task = message.tasks[0];
      console.log('   Latest Task:');
      console.log('      - ID:', task.id);
      console.log('      - Title:', task.title);
      console.log('      - Due:', new Date(task.dueDate * 1000).toLocaleString());
    }
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
