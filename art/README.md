# Art

Source images for the project. These are the masters: files used by the game are copied from here
into `content/panorama/images/custom_game/` (do not symlink: on Windows `content/` is moved into
the Dota install and replaced by a junction, so relative links break).

| File | Use | Size | Status |
| --- | --- | --- | --- |
| `loading-screen.jpg` | Loading screen background (master) | 1376x768 | v2 (Juggernaut and Pudge, ice vs fire); game copy: `content/panorama/images/custom_game/loading_screen/background.jpg` (1920x1080, upscaled). Replace with a higher-resolution render when available |
| `workshop-preview.jpg` | Workshop preview image (master) | 2048x2048 | Final v1 |
| `draft-background.jpg` | Draft screen background (master) | 2752x1536 | Final v1; game copy: `content/panorama/images/custom_game/draft/background.jpg` (1920x1080) |

Guidelines:

- Loading screen: 1920x1080 (16:9), high-quality JPG, 1-2 MB. Keep the title and faces away from
  the edges, since other aspect ratios crop the sides.
- Workshop preview: square (1024x1024). Uploaded through the Workshop Tools publish dialog, not
  shipped with the addon. Must read well as a small thumbnail.
- Layered sources (Figma, PSD) and discarded versions stay outside the repo.
