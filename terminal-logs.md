Download the React DevTools for a better development experience: https://react.dev/link/react-devtools
App.tsx:26 [App] Using stored userId: c798b2f2-97f1-4c5d-ac55-8c1deeda0bd6
App.tsx:26 [App] Using stored userId: c798b2f2-97f1-4c5d-ac55-8c1deeda0bd6
useWebSocket.ts:70 [WebSocket] Connecting to: ws://localhost:8787/ws?userId=c798b2f2-97f1-4c5d-ac55-8c1deeda0bd6
contents.04ff201a.js:335 ResumeSwitcher: Component mounted. Initializing resume (forced=false).
contents.04ff201a.js:335 updateFilling Resume is called
contents.04ff201a.js:335 autofillInstance.coverLetter null
useWebSocket.ts:77 [WebSocket] Connected successfully
useTasks.ts:17 [useTasks] Fetched tasks: 5
useWebSocket.ts:87 [WebSocket] Received: connected
App.tsx:56 [App] Received message: connected
useWebSocket.ts:91 [WebSocket] Failed to parse message: TypeError: Cannot read properties of undefined (reading 'userId')
    at App.tsx:60:73
    at ws.onmessage (useWebSocket.ts:89:13)
ws.onmessage @ useWebSocket.ts:91Understand this error
useTasks.ts:17 [useTasks] Fetched tasks: 5
useWebSocket.ts:87 [WebSocket] Received: confirmation_request
App.tsx:56 [App] Received message: confirmation_request
App.tsx:75 [App] Confirmation requested: Object
useWebSocket.ts:87 [WebSocket] Received: tool_execution_result
App.tsx:56 [App] Received message: tool_execution_result
App.tsx:87 [App] Tool execution result: {
  "success": false,
  "error": "Tool execution rejected or timed out",
  "toolName": "getWeather"
}
useWebSocket.ts:87 [WebSocket] Received: confirmation_request
App.tsx:56 [App] Received message: confirmation_request
App.tsx:75 [App] Confirmation requested: Object
useWebSocket.ts:87 [WebSocket] Received: tool_execution_result
App.tsx:56 [App] Received message: tool_execution_result
App.tsx:87 [App] Tool execution result: {
  "success": true,
  "output": {
    "messageId": "4db80b2f-46a9-44a0-b300-8ed3dfe10349",
    "to": "koppalas@oregonstate.edu",
    "submittedAt": "2025-12-14T04:46:08.266781Z"
  },
  "toolName": "sendEmail"
}
useWebSocket.ts:87 [WebSocket] Received: confirmation_request
App.tsx:56 [App] Received message: confirmation_request
App.tsx:75 [App] Confirmation requested: Object
useWebSocket.ts:87 [WebSocket] Received: tool_execution_result
App.tsx:56 [App] Received message: tool_execution_result
App.tsx:87 [App] Tool execution result: {
  "success": true,
  "output": {
    "city": "Hyderabad",
    "country": "IN",
    "temperature": 24,
    "feelsLike": 24,
    "humidity": 46,
    "description": "haze",
    "windSpeed": 4.12,
    "timestamp": 1765687499
  },
  "toolName": "getWeather"
}
useWebSocket.ts:87 [WebSocket] Received: confirmation_request
App.tsx:56 [App] Received message: confirmation_request
App.tsx:75 [App] Confirmation requested: Object
useWebSocket.ts:87 [WebSocket] Received: tool_execution_result
App.tsx:56 [App] Received message: tool_execution_result
App.tsx:87 [App] Tool execution result: {
  "success": true,
  "output": {
    "city": "Hyderabad",
    "country": "IN",
    "temperature": 24,
    "feelsLike": 24,
    "humidity": 46,
    "description": "haze",
    "windSpeed": 4.12,
    "timestamp": 1765687499
  },
  "toolName": "getWeather"
}
useWebSocket.ts:87 [WebSocket] Received: confirmation_request
App.tsx:56 [App] Received message: confirmation_request
App.tsx:75 [App] Confirmation requested: Object
useWebSocket.ts:87 [WebSocket] Received: tool_execution_result
App.tsx:56 [App] Received message: tool_execution_result
App.tsx:87 [App] Tool execution result: {
  "success": true,
  "output": {
    "messageId": "bc7bbf2b-5777-4208-8362-3017c0d4f21d",
    "to": "puvvadas@oregonstate.edu",
    "submittedAt": "2025-12-14T04:48:19.6825842Z"
  },
  "toolName": "sendEmail"
}