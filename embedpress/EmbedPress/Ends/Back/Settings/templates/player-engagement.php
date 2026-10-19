<?php
/*
 * Player & Engagement landing page (Pro INACTIVE only).
 *
 * Mount point for src/AdminUI/CustomPlayer.js, which renders the page
 * header + tabs with an upgrade panel. The engagement dashboards (Leads,
 * Drop-off Heatmap, Completions) ship with Pro, whose Admin_Page registers
 * its own page on this same slug.
 */

if (!defined('ABSPATH')) exit;
?>
<div class="embedpress-custom-player-wrapper">
    <div id="embedpress-custom-player-root"></div>
</div>
