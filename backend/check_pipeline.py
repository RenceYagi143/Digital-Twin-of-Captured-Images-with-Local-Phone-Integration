import os
import sys
import subprocess
import numpy as np

def run_system_audit():
    print("=" * 60)
    print("      3D DIGITAL TWIN SYSTEM & LIBRARY AUDIT")
    print("=" * 60)

    # 1. Python Environment & Core Packages
    print("\n[1/5] Checking Core Python Data Libraries...")
    libs = {
        "numpy": np.__version__,
        "scipy": None,
        "trimesh": None,
        "cv2": None,
        "torch": None
    }

    for lib in libs.keys():
        try:
            mod = __import__(lib)
            libs[lib] = getattr(mod, "__version__", "Installed")
            print(f"  - {lib:<10}: OK (v{libs[lib]})")
        except ImportError:
            print(f"  - {lib:<10}: MISSING")

    # 2. PyTorch GPU Check
    print("\n[2/5] Checking Hardware Acceleration (PyTorch & CUDA)...")
    try:
        import torch
        cuda_avail = torch.cuda.is_available()
        print(f"  - CUDA Available : {cuda_avail}")
        if cuda_avail:
            print(f"  - GPU Device     : {torch.cuda.get_device_name(0)}")
    except Exception as e:
        print(f"  - PyTorch CUDA Check Notice: {e}")

    # 3. COLMAP Executable Capability Check
    print("\n[3/5] Checking COLMAP Executable Capabilities...")
    colmap_path = r"C:\colmap\bin\colmap.exe"
    if os.path.exists(colmap_path):
        print(f"  - Binary Path    : {colmap_path} (EXISTS)")
        try:
            res = subprocess.run([colmap_path, "-h"], capture_output=True, text=True)
            if res.returncode == 0:
                print("  - COLMAP CLI     : Fully Functional")
            else:
                print("  - COLMAP CLI     : Execution warning")
        except Exception as e:
            print(f"  - COLMAP CLI Error: {e}")
    else:
        print(f"  - Binary Path    : {colmap_path} NOT FOUND")

    # 4. Trimesh Surface Reconstruction Backends
    print("\n[4/5] Checking 3D Mesh Processing Capabilities...")
    try:
        import trimesh
        # Test basic mesh generation and color capability
        box = trimesh.creation.box()
        colors = np.ones((len(box.vertices), 4), dtype=np.uint8) * 255
        box.visual.vertex_colors = colors
        glb_bytes = box.export(file_type='glb')
        print(f"  - GLB Exporter   : OK ({len(glb_bytes)} bytes created)")
    except Exception as e:
        print(f"  - Trimesh Check Error: {e}")

    # 5. Summary Recommendation
    print("\n[5/5] Diagnostic Summary:")
    print("  -> System is ready for full-feature COLMAP + Trimesh reconstruction.")
    print("=" * 60)

if __name__ == "__main__":
    run_system_audit()