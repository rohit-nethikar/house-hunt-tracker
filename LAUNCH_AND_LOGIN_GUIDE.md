# House Hunt & School Tracker - Launch and Login Guide

## Overview

This is a Flask-based collaborative tracker for house hunting and school comparisons in Douglas County. It allows two or more people on the same home network to share live house hunting data, including properties, schools, showings, tasks, and comparative scoring.

All data is stored locally as JSON, so changes are instantly visible to all users without cloud dependencies.

## Prerequisites

Before launching the app, ensure you have:
- Python 3.8+ installed
- pip package manager
- Access to the same network (LAN) as other users who want to collaborate
- Web browser (Chrome, Firefox, Safari, Edge)

## Step 1: Install Dependencies

Open a terminal/command prompt and navigate to the project directory:

```bash
cd c:\Users\m239012\OneDrive - Mayo Clinic\GitHub_claude\house-hunt-tracker
```

Install the required Python packages:

```bash
pip install -r requirements.txt
```

This will install:
- Flask 3.0+ (web framework)
- Requests 2.31+ (HTTP library)

## Step 2: Verify Configuration

The app has default authentication credentials that are suitable for local/trusted networks:

**Default Credentials:**
- Username: `abcdef`
- Password: `QOU8IGg89LDB4NACKcve`

### Optional: Customize Credentials (Recommended for Production)

To use different credentials, set environment variables before starting:

**On Windows (Command Prompt):**
```cmd
set AUTH_USERNAME=your_username
set AUTH_PASSWORD=your_secure_password
python app.py
```

**On Windows (PowerShell):**
```powershell
$env:AUTH_USERNAME="your_username"
$env:AUTH_PASSWORD="your_secure_password"
python app.py
```

**On macOS/Linux:**
```bash
export AUTH_USERNAME=your_username
export AUTH_PASSWORD=your_secure_password
python app.py
```

### Optional: Add Geocoding Support

To enable live commute time calculations, set a Google Maps API key:

```bash
set GEOCODE_API_KEY=your_google_maps_api_key
python app.py
```

Get a free API key from: https://developers.google.com/maps/documentation/geocoding

## Step 3: Start the Application

Run the Flask app:

```bash
python app.py
```

You should see output like:
```
 * Running on http://0.0.0.0:5050
 * Press CTRL+C to quit
```

The app will listen on:
- **Local Access:** http://127.0.0.1:5050 (this machine only)
- **Network Access:** http://<your-ip-address>:5050 (other machines on your network)
- **Default Port:** 5050

### Find Your IP Address

To give others the correct URL to access the app:

**Windows:**
```bash
ipconfig
```
Look for "IPv4 Address" under your active network connection.

**macOS/Linux:**
```bash
ifconfig
```
Look for "inet" under your active network interface.

Example network URL: `http://192.168.1.100:5050`

## Step 4: Login to the Application

1. **Open your browser** and go to: http://127.0.0.1:5050

2. **You'll see a login prompt** asking for username and password

3. **Enter the credentials:**
   - Username: `abcdef`
   - Password: `QOU8IGg89LDB4NACKcve`

4. **Click "Login"** or press Enter

5. **You're in!** The Dashboard will load with the house hunting tracker

## Step 5: Navigate the App

Once logged in, you'll see the main navigation at the top:

### **Dashboard** (Home)
- Overview of all house hunting progress
- Status breakdown of houses (Researching, Showing Scheduled, Offer Submitted, etc.)
- Upcoming showings and tours
- Overdue follow-up tasks
- Scoring weights and settings
- Top 5 houses by score
- Top 5 house + school combinations
- Side-by-side house comparison tool

### **Houses**
- View, add, and edit property listings
- Track address, price, condition, commute time
- Upload photos and documents
- Set custom house scores based on your criteria
- Mark status (Researching, Showing Scheduled, Rejected, etc.)
- Add notes and observations

### **Schools**
- Add and compare schools
- Track school ratings and academic performance
- Monitor enrollment status
- Tour scheduling
- School-specific notes

### **Tasks**
- Create action items for your house hunt
- Set due dates and priorities
- Track follow-ups with agents, lenders, inspectors
- Mark tasks complete or overdue

### **Calendar**
- View all showings, tours, and tasks on a calendar
- See upcoming events at a glance
- Quick scheduling and rescheduling

### **Activity**
- Complete history of all changes
- Track who made what changes and when
- Review past updates

## Understanding the Scoring System

The app uses three independent scoring systems:

### **House Score** (How good is the house itself?)
Weighted factors include:
- Affordability (default 30%)
- Condition (default 25%)
- Commute Time (default 25%)
- Size/sqft (default 20%)

You can adjust these weights in the Dashboard under "Scoring Weights"

### **School Score** (How good are the assigned schools?)
Weighted factors include:
- CSPR Rating (default 30%)
- Academics (default 25%)
- Achievement (default 25%)
- Academic Growth (default 20%)

### **Enrollment Probability** (How likely to get into the school?)
Weighted factors include:
- Enrollment Method (default 60%)
- Waitlist Status (default 40%)

## Working with Data

### Adding a House

1. Go to **Houses** tab
2. Click **Add House** button
3. Fill in:
   - Address
   - Price
   - Neighborhood
   - Condition (1-10)
   - Size (sqft)
   - Type (Single Family, Townhouse, etc.)
4. Upload photos (optional)
5. Save

The house will automatically appear on the Dashboard and in comparisons.

### Adding a School

1. Go to **Schools** tab
2. Click **Add School** button
3. Fill in:
   - School name
   - Type (Elementary, Middle, High)
   - CSPR Rating
   - Academic scores
   - Enrollment method
4. Save

### Creating Tasks

1. Go to **Tasks** tab
2. Click **Add Task** button
3. Fill in:
   - Task title (e.g., "Follow up with agent about 1207 Meadow Lark Dr")
   - Due date
   - Priority (High, Medium, Low)
   - Assign to house (optional)
4. Save

### Uploading Photos and Documents

1. Open a house or school
2. Look for file upload section
3. Drag and drop files or click to browse
4. Supported formats:
   - **Photos:** PNG, JPG, JPEG, GIF, WebP (max 15 MB each)
   - **Documents:** PDF, DOC, DOCX, TXT, XLSX, XLS (max 15 MB each)

### Side-by-Side Comparison

1. Go to **Dashboard**
2. Scroll to "Side-by-Side House Comparison"
3. Check the boxes for 2+ houses you want to compare
4. Click "Print Comparison Report"
5. Formatted report opens (can print or save as PDF)

## Collaboration Tips

### Sharing with Others on Your Network

1. Find your machine's IP address (see "Find Your IP Address" above)
2. Share the URL with others: `http://<your-ip-address>:5050`
3. They enter the same login credentials
4. All data is live-synced across all users

### Data is Instantly Shared

- When one person adds a house, it appears immediately for everyone else
- When someone marks a task complete, everyone sees the update
- No refresh needed - changes appear in real-time

### Tips for Collaboration

- Assign one person to be "data keeper" to avoid duplicate entries
- Use the Activity log to see who changed what
- Discuss in person or via chat to coordinate showings and tasks
- Update house notes immediately after viewings while impressions are fresh

## Data Management

### Where Data is Stored

All data is saved in: `data.json`

This is a single JSON file containing:
- All houses and their details
- All schools and their information
- All tasks and their status
- All scoring weights
- Price history (snapshots over time)

### Backups

The app automatically creates backups:
- Backups are stored in: `backups/` folder
- Keeps the last 30 backups
- Old backups are automatically deleted
- Backups are created whenever data changes

### Manual Backup

To manually backup your data:
1. Copy `data.json` to a safe location
2. Consider backing up the `backups/` folder too

### Restoring from Backup

1. Stop the app (Ctrl+C)
2. Copy a backup file from `backups/` folder
3. Rename it to `data.json`
4. Start the app again

## Stopping the App

To stop the application:
1. In the terminal where the app is running, press **Ctrl+C**
2. The app will shut down gracefully
3. All data is automatically saved

## Troubleshooting

### "Authentication required" message

Make sure you're using the correct credentials:
- Username: `abcdef`
- Password: `QOU8IGg89LDB4NACKcve`

If you customized credentials, use those instead.

### "Port 5050 already in use"

Another app is using port 5050. Either:
1. Stop the other app using that port
2. Or set a different port:
   ```bash
   set PORT=5051
   python app.py
   ```
   Then access at: http://127.0.0.1:5051

### Data not appearing on network

1. **Check your firewall:** Make sure Windows Firewall isn't blocking port 5050
2. **Check IP address:** Make sure you're using the correct IP address
3. **Check network:** Ensure devices are on the same network (same WiFi or LAN)
4. **Disable proxy:** Browser proxy settings might block local network access

### Photos won't upload

- Check file size (max 15 MB)
- Check file format (PNG, JPG, JPEG, GIF, WEBP)
- Ensure you have write permission to the app directory

### Lost data / data corrupted

1. Check the `backups/` folder
2. Restore from the most recent backup (see "Restoring from Backup")
3. Contact the data keeper to understand what happened

## Security Notes

- The default credentials (`abcdef`/`QOU8IGg89LDB4NACKcve`) are visible in the code
- This is fine for trusted local networks
- **For production or sensitive data:** Change credentials via environment variables
- The app listens on `0.0.0.0` which means it's accessible from any machine on your network
- For external network access, use a VPN or reverse proxy with HTTPS
- All data is stored in plain text JSON (no encryption)

## Tips and Tricks

### Keyboard Shortcuts
- **Ctrl+K** - Quick search everything
- **Enter** - Submit forms quickly
- **Escape** - Close dialogs

### Commute Time Calculation
- If you set a "Commute destination address" (under Integrations), the app can calculate live commute times
- Requires Google Maps API key
- Updates automatically when you refresh

### Score Adjustments
- Scores recalculate live as you adjust weights
- Experiment with different weight combinations to find what matters most to you
- Save different "presets" for different scenarios (e.g., "Schools matter most" vs "Affordability matters most")

### Search
- Search for any house, school, or task using the search bar at the top
- Searches across all fields: address, neighborhood, school name, notes, etc.

## Advanced: Customizing the Port

To run on a different port:

**Windows:**
```bash
set PORT=8080
python app.py
```

Then access at: http://127.0.0.1:8080

**macOS/Linux:**
```bash
PORT=8080 python app.py
```

## Getting Help

- Check the main README.md for technical details
- Review the app interface - most features have helpful tooltips
- Check the Activity log to see what changed and when
- Ask your "data keeper" or house hunting partner

## Additional Resources

- Flask Documentation: https://flask.palletsprojects.com/
- Python Documentation: https://docs.python.org/
- Google Maps API: https://developers.google.com/maps
