# Face Recognition Server Endpoints

Your React Native app expects the face recognition server to have the following endpoints:

## Required Endpoints

### 1. Health Check (Optional)
- **URL**: `GET /health`
- **Purpose**: Check if server is running
- **Response**: Any successful response (200 OK)

### 2. Get Current User
- **URL**: `GET /get_current_user?user_id={user_id}`
- **Purpose**: Fetch user data from face recognition server
- **Parameters**: 
  - `user_id`: Firebase user ID
- **Expected Response**:
```json
{
  "success": true,
  "user": {
    "email": "user@example.com",
    "name": "User Name",
    "has_face_data": true/false
  }
}
```

### 3. Face Recognition
- **URL**: `POST /recognize_face`
- **Purpose**: Perform face recognition on captured image
- **Request Body**:
```json
{
  "image": "data:image/jpeg;base64,...",
  "person_name": "User Name",
  "user_mail": "user@example.com"
}
```
- **Expected Response**:
```json
{
  "success": true,
  "verified": true/false,
  "confidence": 0.95,
  "person": "User Name",
  "needs_registration": false
}
```

### 4. Face Training
- **URL**: `POST /train_face`
- **Purpose**: Train face recognition model with multiple images
- **Request Body**:
```json
{
  "person_name": "User Name",
  "user_mail": "user@example.com",
  "images": [
    "data:image/jpeg;base64,...",
    "data:image/jpeg;base64,...",
    "data:image/jpeg;base64,..."
  ]
}
```
- **Expected Response**:
```json
{
  "success": true,
  "saved_count": 5,
  "message": "Face training completed successfully"
}
```

### 5. Training Verification
- **URL**: `POST /verify_training`
- **Purpose**: Verify that face training was successful
- **Request Body**:
```json
{
  "user_mail": "user@example.com",
  "person_name": "User Name"
}
```
- **Expected Response**:
```json
{
  "success": true,
  "verified": true,
  "message": "Training verification successful"
}
```

## Current Issue

Your server is running on `http://192.168.29.44:8080` but these endpoints are returning 404 errors, which means:

1. The server is running but doesn't have these specific routes configured
2. The routes might be under a different path (e.g., `/api/recognize_face`)
3. The server might be a different type of server (not face recognition)

## Solutions

### Option 1: Check Server Configuration
Look at your face recognition server code to see:
- What routes are actually configured
- If routes are under a different path (e.g., `/api/`)
- What the correct endpoint URLs should be

### Option 2: Update React Native App
If your server has different endpoints, update the URLs in both `Attendance_fig&cam.js` and `FaceCaptureScreen.js`:

```javascript
// Example: if endpoints are under /api/
const response = await axiosInstance.get(`/api/get_current_user?user_id=${currentUser.uid}`);
const response = await axiosInstance.post('/api/recognize_face', { ... });
const response = await axiosInstance.post('/api/train_face', { ... });
const response = await axiosInstance.post('/api/verify_training', { ... });
```

### Option 3: Implement Missing Endpoints
If you need to implement these endpoints on your server, here's a basic Flask example:

```python
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/health')
def health():
    return jsonify({"status": "ok"})

@app.route('/get_current_user')
def get_current_user():
    user_id = request.args.get('user_id')
    # Implement user lookup logic
    return jsonify({
        "success": True,
        "user": {
            "email": "user@example.com",
            "name": "User Name",
            "has_face_data": True
        }
    })

@app.route('/recognize_face', methods=['POST'])
def recognize_face():
    data = request.json
    # Implement face recognition logic
    return jsonify({
        "success": True,
        "verified": True,
        "confidence": 0.95,
        "person": data.get('person_name'),
        "needs_registration": False
    })

@app.route('/train_face', methods=['POST'])
def train_face():
    data = request.json
    # Implement face training logic
    return jsonify({
        "success": True,
        "saved_count": len(data.get('images', [])),
        "message": "Face training completed successfully"
    })

@app.route('/verify_training', methods=['POST'])
def verify_training():
    data = request.json
    # Implement training verification logic
    return jsonify({
        "success": True,
        "verified": True,
        "message": "Training verification successful"
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
```

## Testing

Use the provided `test-face-server.js` script to test your endpoints once they're configured correctly. 