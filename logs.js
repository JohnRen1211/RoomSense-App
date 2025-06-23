//Script logs
  function getScheduleDataForExport() {
    const rows = Array.from(document.querySelectorAll("#schedule-table table tbody tr"));
    return rows.map(row => {
      const cells = row.querySelectorAll("td");
      return {
        Date: cells[0]?.innerText,
        Time: cells[1]?.innerText,
        Subject: cells[2]?.innerText,
        Instructor: cells[3]?.innerText,
        Section: cells[4]?.innerText
      };
    });
  }

  function exportToCSV() {
    const data = getScheduleDataForExport();
    if (!data.length) return alert("No data to export.");

    const csvRows = [
      Object.keys(data[0]).join(","),
      ...data.map(row => Object.values(row).map(val => `"${val}"`).join(","))
    ];
    
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "schedule.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportToExcel() {
    const data = getScheduleDataForExport();
    if (!data.length) return alert("No data to export.");

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Schedule");

    XLSX.writeFile(workbook, "schedule.xlsx");
  }

    function toggleExportMenu() {
    const menu = document.getElementById("export-menu");
    menu.classList.toggle("hidden");
  }

  function hideExportMenu() {
    document.getElementById("export-menu").classList.add("hidden");
  }

  // Optional: hide menu when clicking outside
  document.addEventListener('click', function (event) {
    const menu = document.getElementById("export-menu");
    const button = event.target.closest('button');
    if (!event.target.closest('#export-menu') && (!button || button.innerText !== 'Print Options ▾')) {
      menu.classList.add("hidden");
    }
  });