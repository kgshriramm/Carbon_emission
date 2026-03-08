const fs = require("fs");
const path = require("path");

const structure = {
  "project-carbon": {
    frontend: {
      public: {
        "logo.svg": "",
        images: {}
      },
      src: {
        app: {
          "(landing)": {
            "page.tsx": "",
            pricing: {},
            about: {},
            contact: {}
          },
          dashboard: {
            "layout.tsx": "",
            "page.tsx": "",
            company: {},
            products: {},
            manufacturing: {},
            emissions: {},
            reports: {},
            verification: {}
          },
          auth: {
            login: {},
            register: {},
            "forgot-password": {}
          }
        },
        components: {
          ui: {
            "button.tsx": "",
            "card.tsx": "",
            "modal.tsx": ""
          },
          dashboard: {
            "sidebar.tsx": "",
            "navbar.tsx": "",
            "stats-card.tsx": ""
          },
          forms: {
            "company-form.tsx": "",
            "emission-form.tsx": "",
            "product-form.tsx": ""
          }
        },
        services: {
          "api.ts": "",
          "auth.ts": "",
          "emissions.ts": "",
          "reports.ts": ""
        },
        utils: {
          "carbonCalculator.ts": "",
          "emissionFactors.ts": "",
          "validators.ts": ""
        },
        hooks: {
          "useAuth.ts": "",
          "useCompany.ts": ""
        },
        styles: {
          "globals.css": ""
        },
        types: {
          "company.ts": "",
          "emissions.ts": "",
          "report.ts": ""
        }
      }
    },

    backend: {
      src: {
        controllers: {
          "authController.js": "",
          "companyController.js": "",
          "emissionController.js": "",
          "reportController.js": ""
        },
        routes: {
          "authRoutes.js": "",
          "companyRoutes.js": "",
          "emissionRoutes.js": "",
          "reportRoutes.js": ""
        },
        services: {
          "carbonService.js": "",
          "reportService.js": "",
          "verificationService.js": ""
        },
        models: {
          "User.js": "",
          "Company.js": "",
          "Emission.js": "",
          "Report.js": ""
        },
        middleware: {
          "authMiddleware.js": "",
          "errorHandler.js": ""
        },
        config: {
          "db.js": "",
          "env.js": ""
        },
        "server.js": ""
      }
    },

    database: {
      "schema.sql": "",
      migrations: {}
    },

    docs: {
      "CBAM-methodology.md": "",
      "API-spec.md": "",
      "architecture.md": ""
    },

    scripts: {
      "seedData.js": "",
      "emissionFactorsImport.js": ""
    },

    ".env": "",
    "package.json": "",
    "README.md": ""
  }
};

function createStructure(base, obj) {
  for (const key in obj) {
    const newPath = path.join(base, key);

    if (typeof obj[key] === "string") {
      fs.writeFileSync(newPath, obj[key]);
    } else {
      fs.mkdirSync(newPath, { recursive: true });
      createStructure(newPath, obj[key]);
    }
  }
}

createStructure(".", structure);
console.log("Project Carbon structure created.");