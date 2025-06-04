import cloudinary
import cloudinary.uploader
import cloudinary.api
import os
from dotenv import load_dotenv
import requests
from io import BytesIO

load_dotenv()

cloudinary.config(
    cloud_name=os.getenv('CLOUDINARY_CLOUD_NAME'),
    api_key=os.getenv('CLOUDINARY_API_KEY'),
    api_secret=os.getenv('CLOUDINARY_API_SECRET'),
    secure=True
)

def upload_to_cloudinary(file_path, folder="face_recognition"):
    """Upload file to Cloudinary and return secure URL"""
    try:
        response = cloudinary.uploader.upload(
            file_path,
            folder=folder,
            resource_type="image",
            quality="auto:good",
            unique_filename=True,
            overwrite=False
        )
        return response['secure_url']
    except Exception as e:
        print(f"Cloudinary upload error: {str(e)}")
        return None

def download_from_cloudinary(url):
    """Download image from Cloudinary URL"""
    try:
        response = requests.get(url)
        response.raise_for_status()
        return response.content
    except Exception as e:
        print(f"Cloudinary download error: {str(e)}")
        return None

def list_folder_contents(folder_path):
    """List all resources in a Cloudinary folder"""
    try:
        result = cloudinary.api.resources(
            type="upload",
            prefix=folder_path,
            max_results=500
        )
        return result.get('resources', [])
    except Exception as e:
        print(f"Cloudinary list error: {str(e)}")
        return []