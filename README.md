# Garage Manager

A comprehensive spare parts inventory management system for garages.

## Features

- 📦 Parts inventory management
- 📋 Bill generation and tracking
- 👥 Customer management
- 💰 Credit/Udhaari tracking
- 🛒 Shopping cart functionality
- 📊 Dashboard with analytics
- 🌓 Dark mode support
- 📱 Responsive design

## Development Setup

1. Clone the repository:
```bash
git clone https://github.com/cypher-0-shift/Garage-manager.git
cd Garage-manager
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory (see `.env.example` for reference)

4. Run the development server:
```bash
npm run dev
```

5. Build for production:
```bash
npm run build
```

## Authentication

**Note:** Authentication is currently bypassed for development purposes. You can login with any email and password credentials.

The Firebase authentication logic has been commented out in:
- `src/pages/Auth.tsx` - Login and signup handlers
- `src/components/ProtectedRoute.tsx` - Route protection
- `src/components/Navigation.tsx` - Logout handler
- `src/pages/Settings.tsx` - Logout handler

To re-enable Firebase authentication, uncomment the original code blocks marked with "ORIGINAL FIREBASE AUTH CODE - COMMENTED OUT".

## Tech Stack

- **Frontend:** React + TypeScript
- **UI Framework:** Tailwind CSS + shadcn/ui
- **Routing:** React Router
- **State Management:** React Context API
- **Build Tool:** Vite
- **Authentication:** Firebase Auth (currently disabled)
- **Database:** Firebase Firestore (configured but not active)

## Project Structure

```
src/
├── components/       # Reusable UI components
├── context/         # React context providers
├── hooks/           # Custom React hooks
├── integrations/    # Firebase integration
├── lib/             # Utility functions
├── pages/           # Page components
└── main.tsx         # Application entry point
```

## License

MIT
