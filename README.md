# Best of 2025 - Company Voting Site

A ranked choice voting website for your company to pick their top 3 Movies, TV Shows, and Video Games of 2025.

## Features

- **Ranked Choice Voting**: Users select and rank their top 3 picks for each category
- **Real Database Search**: Pull from TMDB (movies/TV) and RAWG (games) APIs
- **Gold/Silver/Bronze Rankings**: Beautiful medal-styled 1st, 2nd, 3rd place badges
- **Reorder Support**: Move picks up/down to adjust rankings
- **Password Protected**: Simple company-only access

## Setup Instructions

### 1. Get API Keys

#### TMDB (Movies & TV Shows)
1. Go to https://www.themoviedb.org/signup and create an account
2. Go to https://www.themoviedb.org/settings/api
3. Request an API key (choose "Developer" option)
4. Copy your API Key (v3 auth)

#### RAWG (Video Games)
1. Go to https://rawg.io/apidocs
2. Click "Get API Key"
3. Sign up and copy your API key

### 2. Set Up Google Sheets Backend

#### Create the Spreadsheet
1. Go to https://sheets.google.com and create a new spreadsheet
2. Name it "2025 Votes" (or whatever you prefer)
3. In Row 1, add these headers:

```
Timestamp | Voter Name | Movie 1st | Movie 2nd | Movie 3rd | TV 1st | TV 2nd | TV 3rd | Game 1st | Game 2nd | Game 3rd
```

#### Deploy the Apps Script
1. In your Google Sheet, go to **Extensions → Apps Script**
2. Delete any code in the editor and paste this:

```javascript
function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = JSON.parse(e.postData.contents);
    
    sheet.appendRow([
      new Date().toISOString(),
      data.voterName,
      data.movie1st,
      data.movie2nd,
      data.movie3rd,
      data.tv1st,
      data.tv2nd,
      data.tv3rd,
      data.game1st,
      data.game2nd,
      data.game3rd
    ]);
    
    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

3. Click **Deploy → New deployment**
4. Click the gear icon next to "Select type" and choose **Web app**
5. Set:
   - Description: "2025 Votes API"
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy**
7. Authorize the app when prompted
8. Copy the **Web app URL** - you'll need this!

### 3. Configure the Site

1. Open `config.js`
2. Replace the placeholder values:
   - `TMDB_API_KEY`: Your TMDB API key
   - `RAWG_API_KEY`: Your RAWG API key
   - `GOOGLE_SHEETS_URL`: Your Apps Script web app URL
   - `SITE_PASSWORD`: Choose a password to share with your company

### 4. Deploy to GitHub Pages

1. Create a new GitHub repository
2. Push all files to the repository
3. Go to **Settings → Pages**
4. Under "Source", select **Deploy from a branch**
5. Choose **main** branch and **/ (root)** folder
6. Click Save
7. Your site will be live at `https://yourusername.github.io/reponame`

### 5. Share with Your Team

Share the URL and the password with your company. They can now vote!

## Viewing Results

Open your Google Sheet to see all rankings in real-time. Each voter's row contains:
- Their name
- 1st, 2nd, 3rd place picks for Movies
- 1st, 2nd, 3rd place picks for TV Shows  
- 1st, 2nd, 3rd place picks for Video Games

### Analyzing Ranked Results

You can use weighted scoring to determine winners:
- **3 points** for each 1st place vote
- **2 points** for each 2nd place vote
- **1 point** for each 3rd place vote

Or use Google Sheets formulas to count votes and create charts!

## Files

- `index.html` - Main HTML structure with ranked selection UI
- `styles.css` - Styling including gold/silver/bronze rank badges
- `app.js` - Application logic (search, ranking, reorder, API calls)
- `config.js` - Configuration (API keys, password)

## Security Note

The password protection is client-side only - it's not truly secure, but sufficient for a casual internal voting site. Don't use this for anything sensitive!
