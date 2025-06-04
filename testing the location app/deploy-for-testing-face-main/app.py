from flask import Flask, request, jsonify
import os
import base64
import cv2
import numpy as np
import pickle
import sqlite3
from mtcnn import MTCNN
from deepface import DeepFace
from datetime import datetime
import logging
from werkzeug.utils import secure_filename
import uuid
import traceback
import cloudinary
import cloudinary.uploader
import cloudinary.api
import io
import json
import tensorflow as tf
from dotenv import load_dotenv
load_dotenv()
# Suppress TensorFlow CPU instruction warnings
tf.get_logger().setLevel('ERROR')
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


cloudinary.config(
    cloud_name=os.getenv('CLOUDINARY_CLOUD_NAME'),
    api_key=os.getenv('CLOUDINARY_API_KEY'),
    api_secret=os.getenv('CLOUDINARY_API_SECRET'),
    secure=True
)
app = Flask(__name__)

@app.route('/')
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat()
    })

# Configuration
MODEL_PATH = 'face_model.h5'
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), 'user_data'))
DATABASE_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), 'attendance.db'))
FACE_SIZE = (160, 160)
DETECTOR = MTCNN()
MIN_FACE_CONFIDENCE = 0.95
RECOGNITION_THRESHOLD = 0.45
MIN_TRAINING_IMAGES = 5
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB

# Helper functions (move all your existing helper functions here)
def cleanup_old_files():
    """Clean up old temporary files"""
    try:
        if os.path.exists(BASE_DIR):
            for user_mail in os.listdir(BASE_DIR):
                user_dir = os.path.join(BASE_DIR, user_mail)
                if os.path.isdir(user_dir):
                    for filename in os.listdir(user_dir):
                        if not (filename in ['embeddings.pkl', 'labels.pkl']):
                            os.remove(os.path.join(user_dir, filename))
        logger.info("Cleanup completed successfully")
    except Exception as e:
        logger.error(f"Cleanup error: {str(e)}")
def init_db():
    """Initialize SQLite database with required tables"""
    try:
        os.makedirs(BASE_DIR, exist_ok=True)
        conn = sqlite3.connect(DATABASE_PATH)
        c = conn.cursor()
        c.execute('PRAGMA foreign_keys = ON')
        
        # Remove these lines:
        # c.execute('DROP TABLE IF EXISTS attendance')
        # c.execute('DROP TABLE IF EXISTS users')
        
        # Keep the CREATE TABLE IF NOT EXISTS statements
        c.execute('''CREATE TABLE IF NOT EXISTS users
                     (id INTEGER PRIMARY KEY AUTOINCREMENT,
                      user_mail TEXT UNIQUE NOT NULL,
                      name TEXT NOT NULL,
                      email TEXT,
                      role TEXT DEFAULT 'user',
                      last_trained DATETIME,
                      cloudinary_urls TEXT DEFAULT '[]',
                      created_at DATETIME DEFAULT CURRENT_TIMESTAMP)''')
        
        c.execute('''CREATE TABLE IF NOT EXISTS attendance
                     (id INTEGER PRIMARY KEY AUTOINCREMENT,
                      user_mail TEXT NOT NULL,
                      person_name TEXT NOT NULL,
                      timestamp DATETIME NOT NULL,
                      status TEXT NOT NULL DEFAULT 'Present',
                      confidence REAL,
                      verification_data TEXT,
                      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                      FOREIGN KEY (user_mail) REFERENCES users(user_mail) ON DELETE CASCADE)''')
        
        conn.commit()
        conn.close()
        logger.info("Database initialized successfully")
        return True
    except Exception as e:
        logger.error(f"Database initialization error: {str(e)}")
        return False
def ensure_database_exists():
    """Check if database exists and create it if it doesn't"""
    try:
        if not os.path.exists(DATABASE_PATH):
            logger.info("Database file not found, creating new database")
            return init_db()
        return True
    except Exception as e:
        logger.error(f"Error checking database: {str(e)}")
        return False

# Initialize application
def initialize_app():
    """Initialize the application with all required setup"""
    try:
        # Create base directory
        os.makedirs(BASE_DIR, exist_ok=True)
        
        # Initialize database
        if not ensure_database_exists():
            logger.error("Failed to initialize database on startup")
            raise RuntimeError("Could not initialize database")
            
        # Run cleanup
        cleanup_old_files()
        
        logger.info("Application initialized successfully")
    except Exception as e:
        logger.error(f"Application initialization error: {str(e)}")
        raise

# Initialize the app
initialize_app()

# Create a WSGI application object for Gunicorn
application = app

# Initialize database on startup
def init_app():
    """Initialize the application"""
    try:
        # Create base directory
        os.makedirs(BASE_DIR, exist_ok=True)
        
        # Initialize database
        if not init_db():
            logger.error("Failed to initialize database on startup")
            raise RuntimeError("Could not initialize database")
            
        # Run cleanup
        cleanup_old_files()
        
        logger.info("Application initialized successfully")
    except Exception as e:
        logger.error(f"Application initialization error: {str(e)}")
        raise

# Run initialization on startup
init_app()

def get_user_dir(user_mail):
    """Get path to user's data directory"""
    user_dir = os.path.join(BASE_DIR, user_mail)
    os.makedirs(user_dir, exist_ok=True)
    return user_dir

def get_user_embeddings_path(user_mail):
    """Get path to user's embeddings file"""
    return os.path.join(get_user_dir(user_mail), 'embeddings.pkl')

def get_user_labels_path(user_mail):
    """Get path to user's labels file"""
    return os.path.join(get_user_dir(user_mail), 'labels.pkl')

def load_user_embeddings(user_mail):
    """Load embeddings for a specific user"""
    try:
        embeddings_path = get_user_embeddings_path(user_mail)
        labels_path = get_user_labels_path(user_mail)
        
        if os.path.exists(embeddings_path) and os.path.exists(labels_path):
            with open(embeddings_path, 'rb') as f:
                embeddings = pickle.load(f)
            with open(labels_path, 'rb') as f:
                labels = pickle.load(f)
            return embeddings, labels
        return None, None
    except Exception as e:
        logger.error(f"Error loading embeddings for user {user_mail}: {str(e)}")
        return None, None

def save_user_embeddings(user_mail, embeddings, labels):
    """Save embeddings for a specific user"""
    try:
        embeddings_path = get_user_embeddings_path(user_mail)
        labels_path = get_user_labels_path(user_mail)
        
        with open(embeddings_path, 'wb') as f:
            pickle.dump(embeddings, f)
        with open(labels_path, 'wb') as f:
            pickle.dump(labels, f)
        return True
    except Exception as e:
        logger.error(f"Error saving embeddings for user {user_mail}: {str(e)}")
        return False

# Initialize directories
os.makedirs(BASE_DIR, exist_ok=True)

# Run cleanup on startup
cleanup_old_files()

def validate_image_data(image_data):
    """Validate base64 image data"""
    if not isinstance(image_data, str):
        return False
    if not image_data.startswith('data:image/'):
        return False
    if ';base64,' not in image_data:
        return False
    return True

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def preprocess_face(image, target_size=FACE_SIZE):
    """Preprocess face image for FaceNet model"""
    try:
        face = image.astype('float32')
        mean, std = face.mean(), face.std()
        face = (face - mean) / std
        face = cv2.resize(face, target_size)
        face = np.expand_dims(face, axis=0)
        return face
    except Exception as e:
        logger.error(f"Preprocessing error: {str(e)}")
        return None

def extract_face(image_bytes):
    """Extract face from image bytes"""
    try:
        if len(image_bytes) > MAX_IMAGE_SIZE:
            logger.warning("Image size exceeds maximum allowed")
            return None
            
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            logger.error("Failed to decode image")
            return None
        
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        results = DETECTOR.detect_faces(rgb_image)
        if not results:
            logger.warning("No faces detected")
            return None
        
        best_face = max(results, key=lambda x: x['confidence'])
        if best_face['confidence'] < MIN_FACE_CONFIDENCE:
            logger.warning(f"Face confidence too low: {best_face['confidence']}")
            return None
        
        x1, y1, width, height = best_face['box']
        # Fix negative coordinates
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = x1 + width, y1 + height
        # Ensure coordinates are within image bounds
        x2, y2 = min(image.shape[1], x2), min(image.shape[0], y2)
        
        face = rgb_image[y1:y2, x1:x2]
        if face.size == 0:
            logger.warning("Empty face region")
            return None
            
        resized = cv2.resize(face, FACE_SIZE)
        return resized
    except Exception as e:
        logger.error(f"Error extracting face: {str(e)}")
        return None

def upload_to_cloudinary(image_data, user_mail):
    """Upload image to Cloudinary and return the URL"""
    try:
        # Convert numpy array to bytes
        is_success, buffer = cv2.imencode(".jpg", image_data)
        if not is_success:
            logger.error("Failed to encode image")
            return None
            
        # Convert to base64
        image_str = base64.b64encode(buffer).decode('utf-8')
        
        # Get username from database
        conn = sqlite3.connect(DATABASE_PATH)
        c = conn.cursor()
        c.execute('SELECT name FROM users WHERE user_mail = ?', (user_mail,))
        result = c.fetchone()
        conn.close()
        
        if not result:
            logger.error(f"No user found with email: {user_mail}")
            return None
            
        username = result[0]
        
        # Sanitize username for folder name (remove special characters and spaces)
        folder_name = ''.join(c for c in username if c.isalnum() or c in ['-', '_']).replace(' ', '_')
        
        # Upload to Cloudinary
        upload_result = cloudinary.uploader.upload(
            f"data:image/jpeg;base64,{image_str}",
            folder=f"face_recognition/{folder_name}",
            public_id=f"face_{uuid.uuid4()}",
            resource_type="image",
            overwrite=False,
            unique_filename=True
        )
        
        if not upload_result or 'secure_url' not in upload_result:
            logger.error("Upload successful but no secure URL returned")
            return None
            
        logger.info(f"Successfully uploaded image to Cloudinary for user {username} (folder: {folder_name})")
        return upload_result['secure_url']
    except Exception as e:
        logger.error(f"Cloudinary upload error for user {user_mail}: {str(e)}")
        return None

@app.route('/train_face', methods=['POST'])
def train_face():
    try:
        # Ensure database exists
        if not ensure_database_exists():
            return jsonify({'error': 'Database initialization failed'}), 500

        if not request.is_json:
            return jsonify({'error': 'Request must be JSON'}), 400
            
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        person_name = data.get('person_name')
        user_mail = data.get('user_mail')
        images = data.get('images', [])
        
        logger.info(f"Received face training request for {person_name} (ID: {user_mail}) with {len(images)} images")
        
        if not person_name or not isinstance(person_name, str):
            return jsonify({'error': 'Valid person name is required'}), 400
        
        if not user_mail or not isinstance(user_mail, str):
            return jsonify({'error': 'Valid user ID is required'}), 400
        
        if not isinstance(images, list) or len(images) < MIN_TRAINING_IMAGES:
            return jsonify({
                'error': f'At least {MIN_TRAINING_IMAGES} valid images are required as a list'
            }), 400

        # Create user directory if it doesn't exist
        user_dir = get_user_dir(user_mail)
        
        try:
            # First ensure user exists in database
            conn = sqlite3.connect(DATABASE_PATH)
            c = conn.cursor()
            
            # Check if user exists
            c.execute('SELECT id FROM users WHERE user_mail = ?', (user_mail,))
            user_exists = c.fetchone()
            
            if not user_exists:
                logger.info(f"Creating new user record for {person_name} (ID: {user_mail})")
                c.execute('''INSERT INTO users 
                            (user_mail, name, email, role, last_trained, cloudinary_urls)
                            VALUES (?, ?, ?, ?, ?, ?)''',
                         (user_mail, person_name, None, 'staff', datetime.now().isoformat(), '[]'))
                conn.commit()

            # Load model early to avoid timeout
            try:
                model = DeepFace.build_model('Facenet')
                logger.info("Successfully loaded Facenet model")
            except Exception as e:
                logger.error(f"Failed to load Facenet model: {str(e)}")
                return jsonify({'error': 'Failed to initialize face recognition model'}), 500

            # Load existing embeddings for user if any
            user_embeddings, user_labels = load_user_embeddings(user_mail)
            if user_embeddings is None:
                user_embeddings = []
                user_labels = []

            saved_count = 0
            cloudinary_urls = []
            processed_images = []
            
            # Process images in smaller batches
            BATCH_SIZE = 2
            for i in range(0, len(images), BATCH_SIZE):
                batch = images[i:i + BATCH_SIZE]
                logger.info(f"Processing batch {i//BATCH_SIZE + 1}/{(len(images) + BATCH_SIZE - 1)//BATCH_SIZE}")
                
                for img_data in batch:
                    try:
                        if not validate_image_data(img_data):
                            logger.warning(f"Invalid image format at index {i}")
                            continue
                        
                        # Extract base64 data
                        header, encoded = img_data.split(',', 1)
                        try:
                            image_bytes = base64.b64decode(encoded)
                        except Exception as e:
                            logger.warning(f"Invalid base64 data: {str(e)}")
                            continue
                        
                        # Extract and process face
                        face = extract_face(image_bytes)
                        if face is None:
                            logger.warning("No valid face found in image")
                            continue
                        
                        # Get embedding first (most time-critical operation)
                        preprocessed = preprocess_face(face)
                        if preprocessed is None:
                            logger.warning("Could not preprocess face")
                            continue
                            
                        embedding = model.predict(preprocessed)[0]
                        embedding = embedding / np.linalg.norm(embedding)
                        
                        # Only upload to Cloudinary if face is valid
                        cloudinary_url = upload_to_cloudinary(face, user_mail)
                        if cloudinary_url:
                            cloudinary_urls.append(cloudinary_url)
                            logger.info(f"Uploaded face image to Cloudinary")
                        
                        processed_images.append(embedding)
                        user_labels.append(person_name)
                        saved_count += 1
                        
                    except Exception as e:
                        logger.error(f"Error processing image: {str(e)}")
                        continue
                
                # Update progress in database
                try:
                    c.execute('''UPDATE users 
                                SET cloudinary_urls = ?, last_trained = ?
                                WHERE user_mail = ?''',
                             (str(cloudinary_urls), datetime.now().isoformat(), user_mail))
                    conn.commit()
                except sqlite3.Error as e:
                    logger.error(f"Database error during progress update: {str(e)}")
        
            if saved_count < MIN_TRAINING_IMAGES:
                return jsonify({
                    'error': f'Only {saved_count} valid faces found (minimum {MIN_TRAINING_IMAGES} required)'
                }), 400
            
            # Update embeddings for this user
            user_embeddings.extend(processed_images)
            
            # Save updated embeddings
            if not save_user_embeddings(user_mail, user_embeddings, user_labels):
                return jsonify({'error': 'Failed to save face embeddings'}), 500
            
            # Final database update
            try:
                c.execute('''UPDATE users 
                            SET name = ?, last_trained = ?, cloudinary_urls = ?
                            WHERE user_mail = ?''',
                         (person_name, datetime.now().isoformat(), str(cloudinary_urls), user_mail))
                conn.commit()
                logger.info("Successfully updated user in database")
                
            except sqlite3.Error as e:
                conn.close()
                logger.error(f"Database error: {str(e)}")
                return jsonify({'error': f'Database error: {str(e)}'}), 500
                
            return jsonify({
                'success': True,
                'saved_count': saved_count,
                'message': f'Saved {saved_count} face embeddings for {person_name}',
                'user_mail': user_mail,
                'cloudinary_urls': cloudinary_urls
            })
            
        except Exception as e:
            logger.error(f"Training error: {str(e)}")
            logger.error(traceback.format_exc())
            return jsonify({'error': str(e)}), 500
        finally:
            if 'conn' in locals():
                conn.close()
            
    except Exception as e:
        logger.error(f"Training error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/train_model', methods=['POST'])
def train_model():
    try:
        # Get all user IDs from the database
        conn = sqlite3.connect(DATABASE_PATH)
        c = conn.cursor()
        c.execute('SELECT user_mail FROM users')
        user_mails = [row[0] for row in c.fetchall()]
        conn.close()

        if not user_mails:
            return jsonify({'error': 'No users found in database'}), 400

        total_embeddings = 0
        processed_users = 0

        # Process each user's embeddings
        for user_mail in user_mails:
            user_embeddings, user_labels = load_user_embeddings(user_mail)
            if user_embeddings is not None and len(user_embeddings) > 0:
                total_embeddings += len(user_embeddings)
                processed_users += 1

        if processed_users == 0:
            return jsonify({'error': 'No training data available'}), 400

        return jsonify({
            'success': True,
            'message': 'Training complete',
            'model_updated': True,
            'user_count': processed_users,
            'total_embeddings': total_embeddings
        })
    except Exception as e:
        logger.error(f"Model training error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/verify_training', methods=['POST'])
def verify_training():
    try:
        if not request.is_json:
            return jsonify({'error': 'Request must be JSON'}), 400
            
        data = request.get_json()
        user_mail = data.get('user_mail')
        person_name = data.get('person_name')
        
        if not user_mail or not isinstance(user_mail, str):
            return jsonify({'error': 'Valid user ID is required'}), 400
        if not person_name or not isinstance(person_name, str):
            return jsonify({'error': 'Valid person name is required'}), 400
        
        # Check if embeddings exist for this user
        user_embeddings, user_labels = load_user_embeddings(user_mail)
        
        if user_embeddings is None or len(user_embeddings) < MIN_TRAINING_IMAGES:
            return jsonify({
                'success': False,
                'error': 'Insufficient training data for verification',
                'has_embeddings': user_embeddings is not None,
                'embedding_count': len(user_embeddings) if user_embeddings is not None else 0
            }), 400
        
        # Check if the person name matches
        if person_name not in user_labels:
            return jsonify({
                'success': False,
                'error': 'Person name does not match training data',
                'stored_names': list(set(user_labels))
            }), 400
        
        return jsonify({
            'success': True,
            'message': 'Training verified successfully',
            'embedding_count': len(user_embeddings),
            'person_name': person_name
        })
        
    except Exception as e:
        logger.error(f"Verification error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/mark_attendance', methods=['POST'])
def mark_attendance():
    try:
        logger.info("Received attendance marking request")
        if not request.is_json:
            return jsonify({'error': 'Request must be JSON'}), 400
            
        data = request.get_json()
        logger.info("Attendance request data: %s", 
                   {k: v if k not in ['image', 'verification_data'] else '<omitted>' 
                    for k, v in data.items()})
        
        user_mail = data.get('user_mail') or data.get('user_id')  # Support both fields
        person_name = data.get('person_name')
        status = data.get('status', 'Present')
        confidence = data.get('confidence')
        verification_data = data.get('verification_data', {})
        
        if not user_mail or not isinstance(user_mail, str):
            logger.error("No valid user_mail provided")
            return jsonify({
                'success': False,
                'error': 'Valid user email is required'
            }), 400
            
        if not person_name or not isinstance(person_name, str):
            logger.error("No valid person_name provided")
            return jsonify({
                'success': False,
                'error': 'Valid person name is required'
            }), 400
        
        conn = sqlite3.connect(DATABASE_PATH)
        c = conn.cursor()
        
        try:
            # Check if user exists
            c.execute('SELECT id, name FROM users WHERE user_mail = ?', (user_mail,))
            user = c.fetchone()
            if not user:
                logger.error(f"User not found: {user_mail}")
                conn.close()
                return jsonify({
                    'success': False,
                    'error': 'User not found in database'
                }), 404
            
            # Check for existing attendance today
            today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
            today_end = datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999).isoformat()
            
            c.execute('''SELECT * FROM attendance 
                        WHERE user_mail = ? 
                        AND timestamp BETWEEN ? AND ?
                        AND status = ?''', 
                     (user_mail, today_start, today_end, status))
            existing = c.fetchone()
            
            if existing:
                logger.info(f"Attendance already marked today for {user_mail}")
                conn.close()
                return jsonify({
                    'success': False,
                    'message': f'{status} attendance already marked today',
                    'attendance_id': existing[0],
                    'timestamp': existing[3]
                })
            
            # Insert new attendance record
            current_time = datetime.now()
            timestamp = current_time.isoformat()
            
            logger.info(f"Marking attendance for {person_name} ({user_mail})")
            c.execute('''INSERT INTO attendance 
                        (user_mail, person_name, timestamp, status, confidence, verification_data)
                        VALUES (?, ?, ?, ?, ?, ?)''',
                     (user_mail, person_name, timestamp, status, confidence, 
                      json.dumps(verification_data) if verification_data else None))
            
            attendance_id = c.lastrowid
            
            # Update user's last seen timestamp
            c.execute('''UPDATE users 
                        SET last_trained = ?
                        WHERE user_mail = ?''', 
                     (timestamp, user_mail))
            
            conn.commit()
            
            # Prepare response with attendance details
            attendance_details = {
                'id': attendance_id,
                'user_mail': user_mail,
                'person_name': person_name,
                'timestamp': timestamp,
                'status': status,
                'confidence': confidence,
                'date': current_time.strftime('%Y-%m-%d'),
                'time': current_time.strftime('%H:%M:%S')
            }
            
            logger.info(f"Successfully marked attendance for {person_name} ({user_mail})")
            return jsonify({
                'success': True,
                'message': 'Attendance marked successfully',
                'attendance': attendance_details
            })
            
        except sqlite3.Error as db_error:
            logger.error(f"Database error while marking attendance: {str(db_error)}")
            return jsonify({
                'success': False,
                'error': f'Database error: {str(db_error)}'
            }), 500
            
        finally:
            conn.close()
            
    except Exception as e:
        logger.error(f"Attendance marking error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Failed to mark attendance: {str(e)}'
        }), 500

@app.route('/get_current_user', methods=['GET'])
def get_current_user():
    try:
        # Get user_mail from query params
        user_mail = request.args.get('user_mail')
        if not user_mail:
            logger.error("No user_mail provided in request")
            return jsonify({
                'success': False,
                'error': 'User ID is required'
            }), 400

        logger.info(f"Fetching user data for ID: {user_mail}")
        conn = sqlite3.connect(DATABASE_PATH)
        c = conn.cursor()
        
        # Get user data including face registration status
        c.execute('''SELECT user_mail, name, email, role, last_trained, cloudinary_urls 
                    FROM users WHERE user_mail = ?''', (user_mail,))
        user = c.fetchone()
        conn.close()
        
        if not user:
            logger.warning(f"No user found with ID: {user_mail}")
            return jsonify({
                'success': False,
                'error': 'User not found. Please complete face registration first.',
                'needs_registration': True
            }), 404
            
        # Check if user has face data by looking at cloudinary_urls
        has_face_data = user[5] != '[]' and user[5] is not None
        
        logger.info(f"Successfully found user: {user[1]}")
        return jsonify({
            'success': True,
            'user': {
                'id': user[0],
                'name': user[1],
                'email': user[2],
                'role': user[3],
                'last_trained': user[4],
                'has_face_data': has_face_data
            }
        })
        
    except sqlite3.Error as e:
        logger.error(f"Database error in get_current_user: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Database error occurred. Please try again.'
        }), 500
    except Exception as e:
        logger.error(f"Error in get_current_user: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error. Please try again.'
        }), 500
@app.route('/recognize_face', methods=['POST'])
def recognize_face():
    try:
        logger.info("Received face recognition request")
        data = request.get_json()

        # Log request data keys
        logger.info("Request data keys: %s", list(data.keys()) if data else None)

        if not data:
            logger.error("No JSON data received")
            return jsonify({'error': 'No data provided'}), 400

        image_data = data.get('image')
        person_name = data.get('person_name')
        user_mail = data.get('user_mail') or data.get('user_id')

        # Log key parameters
        logger.info("Request parameters: person_name=%s, user_mail=%s, image_data_length=%s",
                    person_name,
                    user_mail,
                    len(image_data) if image_data else None)

        if not user_mail:
            return jsonify({
                'success': False,
                'error': 'User email is required (as user_mail)',
                'needs_registration': True
            }), 400

        if not person_name:
            return jsonify({
                'success': False,
                'error': 'Person name is required'
            }), 400

        if not image_data:
            return jsonify({'error': 'No image provided'}), 400

        # Database check
        conn = sqlite3.connect(DATABASE_PATH)
        c = conn.cursor()
        c.execute('SELECT cloudinary_urls FROM users WHERE user_mail = ? OR user_mail = ?', 
                  (user_mail.lower(), user_mail))
        user_data = c.fetchone()

        if not user_data:
            logger.warning("User %s not found", user_mail)
            return jsonify({
                'success': False,
                'error': 'User not found. Please register first.',
                'needs_registration': True
            }), 400

        if not user_data[0] or user_data[0] == '[]':
            logger.warning("User %s has no registered face", user_mail)
            return jsonify({
                'success': False,
                'error': 'Face not registered. Please complete face registration.',
                'needs_registration': True
            }), 400

        # Check user directory
        user_dir = get_user_dir(user_mail)
        if not os.path.exists(user_dir):
            logger.warning("Face data directory not found for %s", user_mail)
            return jsonify({
                'success': False,
                'error': 'Face data not found. Please register your face again.',
                'needs_registration': True
            }), 400

        # Load embeddings
        user_embeddings, user_labels = load_user_embeddings(user_mail)
        if user_embeddings is None or len(user_embeddings) == 0:
            logger.warning("No embeddings found for %s", user_mail)
            return jsonify({
                'success': False,
                'error': 'Face data not found. Please register your face again.',
                'needs_registration': True
            }), 400

        if not validate_image_data(image_data):
            return jsonify({'error': 'Invalid image format'}), 400

        try:
            header, encoded = image_data.split(',', 1)
            image_bytes = base64.b64decode(encoded)
        except Exception as e:
            logger.error("Image decoding error: %s", str(e))
            return jsonify({'error': 'Invalid image data'}), 400

        face = extract_face(image_bytes)
        if face is None:
            return jsonify({
                'success': False,
                'error': 'No valid face detected'
            }), 400

        try:
            model = DeepFace.build_model('Facenet')
            logger.info("Model loaded successfully")
        except Exception as e:
            logger.error("Model loading error: %s", str(e))
            return jsonify({'error': 'Face recognition model not initialized'}), 500

        preprocessed = preprocess_face(face)
        if preprocessed is None:
            return jsonify({'error': 'Face preprocessing failed'}), 400

        input_embedding = model.predict(preprocessed)[0]
        input_embedding = input_embedding / np.linalg.norm(input_embedding)

        if isinstance(user_embeddings, list):
            user_embeddings = np.array(user_embeddings)

        dists = np.linalg.norm(user_embeddings - input_embedding, axis=1)
        min_distance = float(np.min(dists))
        similarity = float(1 - min_distance)
        confidence = round(similarity * 100, 2)
        is_recognized = similarity > RECOGNITION_THRESHOLD

        logger.info(f"Recognition for {user_mail}: confidence={confidence}%, recognized={is_recognized}")

        return jsonify({
            'success': True,
            'confidence': confidence,
            'distance': min_distance,
            'recognized': is_recognized,
            'verification_status': 'verified' if is_recognized else 'not_recognized',
            'person': person_name,
            'user_mail': user_mail,
            'verified': is_recognized
        })

    except Exception as e:
        logger.error("Unhandled error: %s", str(e))
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/get_user_info/<user_mail>', methods=['GET'])
def get_user_info(user_mail):
    try:
        conn = sqlite3.connect(DATABASE_PATH)
        c = conn.cursor()
        
        c.execute('''SELECT user_mail, name, email, role, last_trained 
                    FROM users WHERE user_mail = ?''', (user_mail,))
        user = c.fetchone()
        conn.close()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
            
        return jsonify({
            'success': True,
            'user': {
                'user_mail': user[0],
                'name': user[1],
                'email': user[2],
                'role': user[3],
                'last_trained': user[4]
            }
        })
    except Exception as e:
        logger.error(f"User info error: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)