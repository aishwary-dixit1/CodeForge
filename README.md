# CodeForge Frontend

A beautiful, professional online IDE for the CodeForge distributed code execution platform.

## Features

- **Multi-Language Support**: Python, Node.js, Java, and C++
- **Real-time Code Execution**: Submit code and get results instantly
- **CodeChef-style Interface**: Familiar two-column layout
- **Input/Output Blocks**: Test your code with custom inputs
- **Execution Status**: Real-time status tracking with runtime metrics
- **Beautiful UI**: Modern dark theme with gradient accents

## Installation

```bash
npm install
```

## Running

```bash
npm start
```

The frontend will start on `http://localhost:3000` (React dev server).

Make sure the backend API is running on `http://localhost:3000` as well (or update the `API_BASE_URL` in `App.js`).

## Configuration

Edit `API_BASE_URL` in `src/App.js` if your backend runs on a different port:

```javascript
const API_BASE_URL = 'http://localhost:3000'; // Change this if needed
```

## Build for Production

```bash
npm run build
```

This creates an optimized production build in the `build/` folder.
