<img width="1509" height="742" alt="image" src="https://github.com/user-attachments/assets/49ae66ba-e314-41a4-80d4-478d76a85657" />


# Creative Canvas AI

Creative Canvas AI is a full-stack web application that provides a real-time, collaborative digital canvas enhanced with powerful AI-driven features. It allows users to create, share, and collaborate on design projects, leveraging artificial intelligence to streamline and inspire the creative process.

## ✨ Key Features

* **Real-Time Collaboration**: Work with your team on the same canvas simultaneously. See live cursor movements and instant updates.
* **Rich Drawing Tools**: A comprehensive set of tools including a pen, eraser, shapes (rectangles, circles), text, and image uploads.
* **AI-Powered Analysis**: Get intelligent insights into your designs. The AI can analyze your canvas to provide descriptions, keywords, and alt-text.
* **Smart Color Palettes**: Automatically generate harmonious color palettes from your canvas or selected images.
* **AI Content Generation**: Generate project titles, creative briefs, and social media captions based on your canvas content.
* **Secure Authentication**: Easy and secure sign-in with Google OAuth 2.0.
* **Project Sharing & Permissions**: Share projects with others via email or a public link, with role-based permissions (owner, editor, viewer).
* **PDF & PNG Export**: Export your final creations as high-quality PDF or PNG files.

---

## 🛠️ Tech Stack

### Backend

* **Framework**: FastAPI
* **Real-Time Communication**: Socket.IO
* **Database**: PostgreSQL with SQLAlchemy ORM
* **Authentication**: JWT, Google OAuth 2.0
* **AI Integration**: Google Cloud Vertex AI (Gemini)
* **Deployment**: ASGI (Uvicorn)

### Frontend

* **Framework**: React 19 with TypeScript
* **Build Tool**: Vite
* **State Management**: React Hooks (useState, useEffect, useContext)
* **Canvas Library**: Konva.js & react-konva
* **Styling**: Modern CSS with variables for a customizable design system
* **API Communication**: Axios with interceptors for token refresh

---

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

* Python 3.8+ and `pip`
* Node.js and `npm`
* PostgreSQL database running
* Google Cloud Project with Vertex AI enabled
* Pexels API Key (for asset suggestions)

### 1. Backend Setup

1.  **Clone the repository:**
    ```bash
    git clone https://your-repository-url/creative-canvas-ai.git
    cd creative-canvas-ai/backend
    ```

2.  **Create a virtual environment and install dependencies:**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows, use `venv\Scripts\activate`
    pip install -r requirements.txt
    ```

3.  **Set up the database:**
    * Ensure your PostgreSQL server is running.
    * Create a new database (e.g., `creative_canvas`).

4.  **Configure Environment Variables:**
    Create a `.env` file in the `backend/` directory and populate it with the following:

    ```env
    # Application
    SECRET_KEY=your_super_secret_key_for_jwt # Generate a strong secret key
    FRONTEND_URL=http://localhost:5173

    # Database
    DATABASE_URL=postgresql://postgres:your_db_password@localhost:5432/creative_canvas

    # Google OAuth
    GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
    GOOGLE_CLIENT_SECRET=your_google_client_secret
    GOOGLE_REDIRECT_URI=http://localhost:8000/auth/google/callback

    # Google Cloud (for AI Features)
    GOOGLE_CLOUD_PROJECT=your-gcp-project-id
    VERTEX_LOCATION=us-central1 # Or your preferred location

    # Pexels API (for AI Asset Suggestions)
    PEXELS_API_KEY=your_pexels_api_key
    ```

5.  **Run the backend server:**
    The application uses Uvicorn to run. From the `backend/` directory:
    ```bash
    uvicorn app.main:asgi_app --reload --port 8000
    ```
    The backend API will be available at `http://localhost:8000`.

---

### 2. Frontend Setup

1.  **Navigate to the frontend directory:**
    ```bash
    cd ../frontend
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**
    The frontend reads the backend API path from its environment. Vite handles this configuration. Create a `.env` file in the `frontend/` directory:

    ```env
    # The base URL for your backend API
    API_PATH=http://localhost:8000
    ```

4.  **Run the frontend development server:**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:5173`.

---

## Usage

1.  Open your browser and navigate to `http://localhost:5173`.
2.  Click "Sign In with Google" to authenticate.
3.  You will be redirected to your dashboard, where you can create new projects.
4.  Create a new project to launch the canvas editor.
5.  Use the share button inside the editor to collaborate with others.

Enjoy creating with **Creative Canvas AI**!
