# RTR Reports Web App

GST Reports and Analytics web application built with Next.js.

## Features

- **HSN Details Report** - Detailed product-level breakdown with CSV export
- **B2C Supplies Report** - State-wise summary of B2C supplies  
- **B2CS Report** - Consolidated GST rate wise taxable values
- **Documents Report** - Document count tracking for GSTR-1 compliance

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

### Login Credentials
- Username: ceymox
- Password: ceym0x1234

## Deployment

### Deploy to Vercel

1. Push code to GitHub
2. Connect repository to Vercel
3. Deploy automatically

### Environment Variables
- `MAGENTO_BASE_URL`: https://api.routestoroots.in/rest/V1

## Tech Stack

- **Framework**: Next.js 14
- **Styling**: Tailwind CSS
- **API**: Magento 2 REST API
- **Deployment**: Vercel

## Project Structure

```
├── pages/
│   ├── api/           # API routes
│   ├── index.js       # Login page
│   └── dashboard.js   # Reports dashboard
├── components/        # React components
├── styles/           # CSS files
└── public/           # Static assets
```