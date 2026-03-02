"use client";

import { Upload, X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DropzoneProps {
	accept?: string;
	disabled?: boolean;
	file: File | null;
	onFileChange: (file: File | null) => void;
	className?: string;
	/** optional description below the drop area */
	description?: React.ReactNode;
}

function Dropzone({
	accept = "image/*,video/*",
	disabled = false,
	file,
	onFileChange,
	className,
	description,
}: DropzoneProps) {
	const inputRef = React.useRef<HTMLInputElement>(null);
	const [isDragActive, setIsDragActive] = React.useState(false);

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (!disabled) setIsDragActive(true);
	};

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragActive(false);
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragActive(false);
		if (disabled) return;
		const dropped = e.dataTransfer.files?.[0];
		if (dropped) onFileChange(dropped);
	};

	const handleClick = () => {
		if (disabled) return;
		inputRef.current?.click();
	};

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const selected = e.target.files?.[0];
		onFileChange(selected ?? null);
		e.target.value = "";
	};

	const clearFile = (e: React.MouseEvent) => {
		e.stopPropagation();
		onFileChange(null);
		if (inputRef.current) inputRef.current.value = "";
	};

	const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
	React.useEffect(() => {
		if (!file) {
			setPreviewUrl(null);
			return;
		}
		const url = URL.createObjectURL(file);
		setPreviewUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [file]);

	return (
		<div className={cn("space-y-1.5", className)}>
			<input
				ref={inputRef}
				type="file"
				accept={accept}
				onChange={handleChange}
				disabled={disabled}
				className="sr-only"
				aria-label="Upload file"
			/>
			{/** biome-ignore lint/a11y/useSemanticElements: <explanation> */}
			<div
				role="button"
				tabIndex={0}
				onClick={handleClick}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						handleClick();
					}
				}}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
				aria-disabled={disabled}
				className={cn(
					"relative flex min-h-[140px] w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed transition-colors",
					"border-input bg-muted/30 hover:bg-muted/50",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
					"disabled:pointer-events-none disabled:opacity-50",
					isDragActive && "border-primary bg-muted/60",
					className,
				)}
			>
				{!file ? (
					<>
						<Upload className="size-8 text-muted-foreground" aria-hidden />
						<p className="mt-2 text-sm font-medium text-foreground">
							{isDragActive
								? "Drop file here"
								: "Drop file here or click to browse"}
						</p>
						<p className="mt-0.5 text-xs text-muted-foreground">
							Images and video
						</p>
					</>
				) : (
					<div className="flex w-full flex-col items-center gap-2 p-3 sm:flex-row sm:justify-center">
						<div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
							{file.type.startsWith("image/") ? (
								previewUrl ? (
									<img
										src={previewUrl}
										alt=""
										className="h-full w-full object-cover"
									/>
								) : (
									<div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
										Image
									</div>
								)
							) : (
								<div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
									Video
								</div>
							)}
						</div>
						<div className="min-w-0 flex-1 text-center sm:text-left">
							<p className="truncate text-sm font-medium">{file.name}</p>
							<p className="text-xs text-muted-foreground">
								{(file.size / 1024).toFixed(1)} KB
							</p>
						</div>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							onClick={clearFile}
							className="shrink-0"
							aria-label="Remove file"
						>
							<X className="size-4" />
						</Button>
					</div>
				)}
			</div>
			{description && (
				<p className="text-xs text-muted-foreground">{description}</p>
			)}
		</div>
	);
}

export { Dropzone };
